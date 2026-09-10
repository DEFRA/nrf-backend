import { retryFailedQuoteEmails } from './retry-failed-quote-emails.js'
import { dbGetRetryableEmailFailures } from '../db/quote-email-notifications/get-retryable-email-failures.js'
import { dbUpdateEmailNotificationForRetry } from '../db/quote-email-notifications/update-email-notification-for-retry.js'
import { dbGetQuoteById } from '../db/quotes/get-quote-by-id.js'
import { dbIssueQuoteAccessToken } from '../db/quote-access-tokens/issue-quote-access-token.js'
import { sendQuoteEmail } from '../../api/quote/helpers/send-quote-email.js'
import { config } from '../../config.js'

vi.mock('../db/quote-email-notifications/get-retryable-email-failures.js')
vi.mock(
  '../db/quote-email-notifications/update-email-notification-for-retry.js'
)
vi.mock('../db/quotes/get-quote-by-id.js')
vi.mock('../db/quote-access-tokens/issue-quote-access-token.js')
vi.mock('../../api/quote/helpers/send-quote-email.js')

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}))
vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}))

// A pooled client whose every `query` resolves with the given lock outcome.
// The worker only inspects the first query's result; the unlock query result is
// unused. `pool.connect` resolves to this client so the session-level advisory
// lock spans the run.
const makePool = (locked = true) => {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [{ locked }] }),
    release: vi.fn()
  }
  return { pool: { connect: vi.fn().mockResolvedValue(client) }, client }
}

const makeQuote = (id) => ({
  id,
  reference: `NRF-00000${id}`,
  planningType: 'full-planning-permission',
  housingUnits: 5,
  email: { address: 'adeola@example.com' },
  edps: [
    {
      edpName: 'Norfolk Fens east',
      levyGbp: {
        amountExcludingVat: 1100,
        amountInflationAdjusted: 1122,
        baseAmount: 1000,
        modelVersion: 1
      }
    }
  ]
})

describe('retryFailedQuoteEmails', () => {
  beforeEach(() => {
    dbGetQuoteById.mockImplementation(async ({ id }) => makeQuote(id))
    dbIssueQuoteAccessToken.mockResolvedValue(undefined)
    dbUpdateEmailNotificationForRetry.mockResolvedValue(undefined)
    sendQuoteEmail.mockResolvedValue({
      notificationId: 'notify-id',
      sentDateTime: '2026-08-18T00:00:00.000Z'
    })
  })

  it('claims the lock, re-sends each failed email with a fresh link and attempt-scoped reference, and updates the existing row with the new notification id', async () => {
    const { pool, client } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([
      { id: 100, quote_id: 42, retry_count: 0 },
      { id: 101, quote_id: 43, retry_count: 3 }
    ])
    sendQuoteEmail
      .mockResolvedValueOnce({
        notificationId: 'notify-id-1',
        sentDateTime: '2026-08-18T00:00:00.000Z'
      })
      .mockResolvedValueOnce({
        notificationId: 'notify-id-2',
        sentDateTime: '2026-08-18T00:00:00.000Z'
      })

    await retryFailedQuoteEmails({ pool })

    const { batchSize, maxRetryAttempts, maxAgeDays } = config.get(
      'notify.retrySendingEmails'
    )
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock')
    )
    expect(dbGetRetryableEmailFailures).toHaveBeenCalledWith({
      db: client,
      limit: batchSize,
      maxRetryAttempts,
      maxAgeDays
    })

    expect(sendQuoteEmail).toHaveBeenCalledTimes(2)
    expect(sendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmailAddress: 'adeola@example.com',
        nrfQuoteReference: 'NRF-0000042',
        emailReference: 'NRF-0000042-retry-1',
        quoteAccessLink: expect.stringMatching(
          /\/quote\/NRF-0000042\/[A-Za-z0-9_-]{43}$/
        )
      })
    )
    expect(sendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        nrfQuoteReference: 'NRF-0000043',
        emailReference: 'NRF-0000043-retry-4'
      })
    )
    expect(dbIssueQuoteAccessToken).toHaveBeenCalledTimes(2)
    expect(dbUpdateEmailNotificationForRetry).toHaveBeenCalledWith({
      db: client,
      id: 100,
      notificationId: 'notify-id-1'
    })
    expect(dbUpdateEmailNotificationForRetry).toHaveBeenCalledWith({
      db: client,
      id: 101,
      notificationId: 'notify-id-2'
    })
  })

  it('releases the client and advisory lock in finally', async () => {
    const { pool, client } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([])

    await retryFailedQuoteEmails({ pool })

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock')
    )
    expect(client.release).toHaveBeenCalled()
  })

  it('skips the tick when another instance holds the lock', async () => {
    const { pool, client } = makePool(false)

    await retryFailedQuoteEmails({ pool })

    expect(dbGetRetryableEmailFailures).not.toHaveBeenCalled()
    expect(sendQuoteEmail).not.toHaveBeenCalled()
    // still releases its own client
    expect(client.release).toHaveBeenCalled()
  })

  it('bumps retry_count without a new notification id when Notify rejects the send, and still runs the rest of the batch', async () => {
    const { pool, client } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([
      { id: 100, quote_id: 42, retry_count: 0 },
      { id: 101, quote_id: 43, retry_count: 0 }
    ])
    sendQuoteEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({
      notificationId: 'notify-id-2',
      sentDateTime: '2026-08-18T00:00:00.000Z'
    })

    await retryFailedQuoteEmails({ pool })

    expect(sendQuoteEmail).toHaveBeenCalledTimes(2)
    expect(dbUpdateEmailNotificationForRetry).toHaveBeenCalledTimes(2)
    // Notify rejected the first retry -> null notificationId still bumps
    // retry_count via the SQL COALESCE / CASE.
    expect(dbUpdateEmailNotificationForRetry).toHaveBeenCalledWith({
      db: client,
      id: 100,
      notificationId: null
    })
    expect(dbUpdateEmailNotificationForRetry).toHaveBeenCalledWith({
      db: client,
      id: 101,
      notificationId: 'notify-id-2'
    })
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: 42, attemptNo: 1 }),
      expect.any(String)
    )
  })

  it('skips a quote that no longer exists without sending or updating', async () => {
    const { pool } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([
      { id: 100, quote_id: 42, retry_count: 0 }
    ])
    dbGetQuoteById.mockResolvedValue(null)

    await retryFailedQuoteEmails({ pool })

    expect(sendQuoteEmail).not.toHaveBeenCalled()
    expect(dbIssueQuoteAccessToken).not.toHaveBeenCalled()
    expect(dbUpdateEmailNotificationForRetry).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: 42 }),
      expect.any(String)
    )
  })

  it('aborts the batch when a quote load fails, so a dead connection wastes no further Notify sends', async () => {
    const { pool } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([
      { id: 100, quote_id: 42, retry_count: 0 },
      { id: 101, quote_id: 43, retry_count: 0 }
    ])
    dbGetQuoteById.mockRejectedValue(new Error('connection terminated'))

    await retryFailedQuoteEmails({ pool })

    // Row 1's DB read failed -> the connection is presumed dead, so the loop
    // breaks and row 2 is never loaded or sent.
    expect(dbGetQuoteById).toHaveBeenCalledTimes(1)
    expect(sendQuoteEmail).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringContaining('quoteId: 42')
    )
  })

  it('still releases the client when the advisory-unlock query rejects', async () => {
    const { pool, client } = makePool(true)
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('pg_advisory_unlock')) {
        throw new Error('connection terminated')
      }
      return { rows: [{ locked: true }] }
    })
    dbGetRetryableEmailFailures.mockResolvedValue([])

    await retryFailedQuoteEmails({ pool })

    // The dead client is released with the error so pg-pool destroys it rather
    // than returning it to the pool for reuse.
    expect(client.release).toHaveBeenCalledWith(expect.any(Error))
  })
})
