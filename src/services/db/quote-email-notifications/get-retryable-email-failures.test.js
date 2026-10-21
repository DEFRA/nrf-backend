import { dbGetRetryableEmailFailures } from './get-retryable-email-failures.js'
import { RETRYABLE_DELIVERY_STATUSES } from '../../../common/constants/notify-status.js'
import {
  EMAIL_TYPE_QUOTE_RESULTS,
  EMAIL_TYPE_RESEND_QUOTE_LINK,
  EMAIL_TYPE_RETRIEVE_QUOTE_LINK
} from '../../../common/constants/email-type.js'
import { setupTestServer } from '../../../test-utils/setup-test-server.js'
import {
  createQuote,
  getQuoteId,
  insertEmailNotification,
  minutesAgo
} from '../../../test-utils/quote-request-helpers.js'
import { publishEvent } from '../../sns/publish-event.js'

vi.mock('../../sns/publish-event.js')

describe('dbGetRetryableEmailFailures', () => {
  const getServer = setupTestServer()
  const createdQuoteIds = []

  const createQuoteWithId = async () => {
    const response = await createQuote(getServer())
    const { reference } = JSON.parse(response.payload)
    const quoteId = await getQuoteId({ server: getServer(), reference })
    createdQuoteIds.push(quoteId)
    return quoteId
  }

  const seedNotification = ({ minutes, ...rest }) =>
    insertEmailNotification({
      server: getServer(),
      createdAt: minutesAgo(minutes),
      ...rest
    })

  const queryFailures = (overrides = {}) =>
    dbGetRetryableEmailFailures({
      db: getServer().pg,
      limit: 10,
      maxRetryAttempts: 4,
      maxAgeDays: 2,
      ...overrides
    })

  // Integration files run in parallel against one database, and another file
  // can legitimately hold a retryable row mid-flow (the retry worker
  // lifecycle test). Exact assertions below only look at their own quotes.
  const failuresFor = async (quoteIds) => {
    const failures = await queryFailures()
    return failures.filter((r) => quoteIds.includes(r.quote_id))
  }

  beforeEach(() => {
    vi.mocked(publishEvent).mockResolvedValue(true)
  })

  beforeAll(async () => {
    // A crashed earlier run can leave retryable failures behind; sweep them so
    // the exact-result assertions below only see rows this run seeds. The
    // advisory lock is the one email-retry-lifecycle.integration.test.js holds
    // while a staged failure is mid-flow, so the sweep cannot delete it.
    const client = await getServer().pg.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('nrf-retryable-email-fixture'))"
      )
      await client.query(
        'DELETE FROM quote_email_notifications WHERE notify_send_status = ANY($1)',
        [RETRYABLE_DELIVERY_STATUSES]
      )
      await client.query('COMMIT')
    } finally {
      client.release()
    }
  })

  afterEach(async () => {
    // Deleting the quote cascades to its seeded notifications
    await getServer().pg.query('DELETE FROM quotes WHERE id = ANY($1)', [
      createdQuoteIds
    ])
    createdQuoteIds.length = 0
  })

  it("returns each quote's retryable failure with its retry count, oldest first", async () => {
    const oldest = await createQuoteWithId()
    const middle = await createQuoteWithId()
    const newest = await createQuoteWithId()

    await seedNotification({
      quoteId: oldest,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'temporary-failure',
      retryCount: 2,
      minutes: 40
    })
    await seedNotification({
      quoteId: middle,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'technical-failure',
      minutes: 30
    })
    await seedNotification({
      quoteId: newest,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 20
    })

    const failures = await failuresFor([oldest, middle, newest])

    expect(
      failures.map(({ quote_id, retry_count }) => ({ quote_id, retry_count }))
    ).toEqual([
      { quote_id: oldest, retry_count: 2 },
      { quote_id: middle, retry_count: 0 },
      { quote_id: newest, retry_count: 0 }
    ])
    for (const row of failures) {
      expect(row.id).toEqual(expect.any(Number))
    }
  })

  it('caps the batch at the limit, keeping the oldest failures', async () => {
    const oldest = await createQuoteWithId()
    const middle = await createQuoteWithId()
    const newest = await createQuoteWithId()

    for (const [quoteId, minutes] of [
      [oldest, 40],
      [middle, 30],
      [newest, 20]
    ]) {
      await seedNotification({
        quoteId,
        emailType: EMAIL_TYPE_QUOTE_RESULTS,
        status: 'temporary-failure',
        minutes
      })
    }

    const failures = await queryFailures({ limit: 2 })

    expect(failures.map((r) => r.quote_id)).toContain(oldest)
    expect(failures.map((r) => r.quote_id)).toContain(middle)
  })

  it('ignores failures superseded by a newer send (user-initiated resend)', async () => {
    const superseded = await createQuoteWithId()
    const stillFailing = await createQuoteWithId()

    // a newer user-initiated resend supersedes the stale failure
    await seedNotification({
      quoteId: superseded,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 30
    })
    await seedNotification({
      quoteId: superseded,
      emailType: EMAIL_TYPE_RESEND_QUOTE_LINK,
      minutes: 10
    })

    await seedNotification({
      quoteId: stillFailing,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 30
    })

    const failures = await failuresFor([superseded, stillFailing])

    expect(failures.map((r) => r.quote_id)).toEqual([stillFailing])
  })

  it('returns failed retrieve quote emails for retry', async () => {
    const quoteId = await createQuoteWithId()

    await seedNotification({
      quoteId,
      emailType: EMAIL_TYPE_RETRIEVE_QUOTE_LINK,
      status: 'temporary-failure',
      minutes: 30
    })

    const failures = await failuresFor([quoteId])

    expect(
      failures.map(({ quote_id, email_type }) => ({ quote_id, email_type }))
    ).toEqual([
      { quote_id: quoteId, email_type: EMAIL_TYPE_RETRIEVE_QUOTE_LINK }
    ])
  })

  it('ignores a failed retrieve quote email superseded by a newer retrieve quote email', async () => {
    const superseded = await createQuoteWithId()
    const stillFailing = await createQuoteWithId()

    // a newer user-initiated magic link request supersedes the stale failure
    await seedNotification({
      quoteId: superseded,
      emailType: EMAIL_TYPE_RETRIEVE_QUOTE_LINK,
      status: 'temporary-failure',
      minutes: 30
    })
    await seedNotification({
      quoteId: superseded,
      emailType: EMAIL_TYPE_RETRIEVE_QUOTE_LINK,
      minutes: 10
    })

    await seedNotification({
      quoteId: stillFailing,
      emailType: EMAIL_TYPE_RETRIEVE_QUOTE_LINK,
      status: 'temporary-failure',
      minutes: 30
    })

    const failures = await failuresFor([superseded, stillFailing])

    expect(failures.map((r) => r.quote_id)).toEqual([stillFailing])
  })

  it('still retries a failed quote email after a newer retrieve quote email', async () => {
    const quoteId = await createQuoteWithId()

    await seedNotification({
      quoteId,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 30
    })
    await seedNotification({
      quoteId,
      emailType: EMAIL_TYPE_RETRIEVE_QUOTE_LINK,
      minutes: 10
    })

    const failures = await failuresFor([quoteId])

    expect(failures.map((r) => r.quote_id)).toEqual([quoteId])
  })

  it('skips rows that have spent their whole retry budget', async () => {
    const quoteId = await createQuoteWithId()

    await seedNotification({
      quoteId,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'temporary-failure',
      retryCount: 4,
      minutes: 30
    })

    expect(await failuresFor([quoteId])).toEqual([])
  })

  it('ignores failures outside the lookback window and permanent failures', async () => {
    const stale = await createQuoteWithId()
    const permanent = await createQuoteWithId()

    await seedNotification({
      quoteId: stale,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 60 * 24 * 3
    })
    await seedNotification({
      quoteId: permanent,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      status: 'permanent-failure',
      minutes: 30
    })

    expect(await failuresFor([stale, permanent])).toEqual([])
  })
})
