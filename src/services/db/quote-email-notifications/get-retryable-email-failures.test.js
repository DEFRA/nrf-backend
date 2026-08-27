import { dbGetRetryableEmailFailures } from './get-retryable-email-failures.js'
import { RETRYABLE_DELIVERY_STATUSES } from '../../../common/constants/notify-status.js'
import { setupTestServer } from '../../../test-utils/setup-test-server.js'
import {
  createQuote,
  getQuoteId,
  insertEmailNotification
} from '../../../test-utils/quote-request-helpers.js'
import { publishEvent } from '../../sns/publish-event.js'

vi.mock('../../sns/publish-event.js')

describe('dbGetRetryableEmailFailures', () => {
  const getServer = setupTestServer()
  const createdQuoteIds = []

  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000)

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

  beforeEach(() => {
    vi.mocked(publishEvent).mockResolvedValue(true)
  })

  beforeAll(async () => {
    // A crashed earlier run can leave retryable failures behind; sweep them so
    // the exact-result assertions below only see rows this run seeds.
    await getServer().pg.query(
      'DELETE FROM quote_email_notifications WHERE status = ANY($1)',
      [RETRYABLE_DELIVERY_STATUSES]
    )
  })

  afterEach(async () => {
    // Deleting the quote cascades to its seeded notifications
    await getServer().pg.query('DELETE FROM quotes WHERE id = ANY($1)', [
      createdQuoteIds
    ])
    createdQuoteIds.length = 0
  })

  it('returns each quote’s latest retryable failure with its retry count, oldest first', async () => {
    const oldest = await createQuoteWithId()
    const middle = await createQuoteWithId()
    const newest = await createQuoteWithId()

    // one accepted retry and one Notify-rejected attempt already spent
    await seedNotification({ quoteId: oldest, emailType: 'retry', minutes: 50 })
    await seedNotification({
      quoteId: oldest,
      emailType: 'retry_rejected',
      minutes: 45
    })
    await seedNotification({
      quoteId: oldest,
      emailType: 'quote_result',
      status: 'temporary-failure',
      minutes: 40
    })

    await seedNotification({
      quoteId: middle,
      emailType: 'quote_result',
      status: 'technical-failure',
      minutes: 30
    })

    await seedNotification({
      quoteId: newest,
      emailType: 'quote_result',
      status: 'temporary-failure',
      minutes: 20
    })

    expect(await queryFailures()).toEqual([
      { quote_id: oldest, retry_count: 2 },
      { quote_id: middle, retry_count: 0 },
      { quote_id: newest, retry_count: 0 }
    ])
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
        emailType: 'quote_result',
        status: 'temporary-failure',
        minutes
      })
    }

    expect(await queryFailures({ limit: 2 })).toEqual([
      { quote_id: oldest, retry_count: 0 },
      { quote_id: middle, retry_count: 0 }
    ])
  })

  it('ignores failures superseded by a newer send, but not by a newer rejected retry', async () => {
    const superseded = await createQuoteWithId()
    const rejectedRetry = await createQuoteWithId()

    // a newer user-initiated resend supersedes the stale failure
    await seedNotification({
      quoteId: superseded,
      emailType: 'quote_result',
      status: 'temporary-failure',
      minutes: 30
    })
    await seedNotification({
      quoteId: superseded,
      emailType: 'resend',
      minutes: 10
    })

    // a newer retry Notify rejected never suppresses the failure it belongs to
    await seedNotification({
      quoteId: rejectedRetry,
      emailType: 'quote_result',
      status: 'temporary-failure',
      minutes: 30
    })
    await seedNotification({
      quoteId: rejectedRetry,
      emailType: 'retry_rejected',
      minutes: 10
    })

    expect(await queryFailures()).toEqual([
      { quote_id: rejectedRetry, retry_count: 1 }
    ])
  })

  it('skips quotes that have spent their whole retry budget', async () => {
    const quoteId = await createQuoteWithId()

    for (const minutes of [60, 55, 50, 45]) {
      await seedNotification({ quoteId, emailType: 'retry', minutes })
    }
    await seedNotification({
      quoteId,
      emailType: 'quote_result',
      status: 'temporary-failure',
      minutes: 30
    })

    expect(await queryFailures()).toEqual([])
  })

  it('ignores failures outside the lookback window and permanent failures', async () => {
    const stale = await createQuoteWithId()
    const permanent = await createQuoteWithId()

    await seedNotification({
      quoteId: stale,
      emailType: 'quote_result',
      status: 'temporary-failure',
      minutes: 60 * 24 * 3
    })
    await seedNotification({
      quoteId: permanent,
      emailType: 'quote_result',
      status: 'permanent-failure',
      minutes: 30
    })

    expect(await queryFailures()).toEqual([])
  })
})
