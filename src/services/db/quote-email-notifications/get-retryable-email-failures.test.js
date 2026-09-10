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
  const QUOTE_RESULTS = 'quote_results'

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
      'DELETE FROM quote_email_notifications WHERE notify_send_status = ANY($1)',
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

  it("returns each quote's retryable failure with its retry count, oldest first", async () => {
    const oldest = await createQuoteWithId()
    const middle = await createQuoteWithId()
    const newest = await createQuoteWithId()

    await seedNotification({
      quoteId: oldest,
      emailType: QUOTE_RESULTS,
      status: 'temporary-failure',
      retryCount: 2,
      minutes: 40
    })
    await seedNotification({
      quoteId: middle,
      emailType: QUOTE_RESULTS,
      status: 'technical-failure',
      minutes: 30
    })
    await seedNotification({
      quoteId: newest,
      emailType: QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 20
    })

    const failures = await queryFailures()

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
        emailType: QUOTE_RESULTS,
        status: 'temporary-failure',
        minutes
      })
    }

    const failures = await queryFailures({ limit: 2 })

    expect(failures.map((r) => r.quote_id)).toEqual([oldest, middle])
  })

  it('ignores failures superseded by a newer send (user-initiated resend)', async () => {
    const superseded = await createQuoteWithId()
    const stillFailing = await createQuoteWithId()

    // a newer user-initiated resend supersedes the stale failure
    await seedNotification({
      quoteId: superseded,
      emailType: QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 30
    })
    await seedNotification({
      quoteId: superseded,
      emailType: 'resend_quote_link',
      minutes: 10
    })

    await seedNotification({
      quoteId: stillFailing,
      emailType: QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 30
    })

    const failures = await queryFailures()

    expect(failures.map((r) => r.quote_id)).toEqual([stillFailing])
  })

  it('skips rows that have spent their whole retry budget', async () => {
    const quoteId = await createQuoteWithId()

    await seedNotification({
      quoteId,
      emailType: QUOTE_RESULTS,
      status: 'temporary-failure',
      retryCount: 4,
      minutes: 30
    })

    expect(await queryFailures()).toEqual([])
  })

  it('ignores failures outside the lookback window and permanent failures', async () => {
    const stale = await createQuoteWithId()
    const permanent = await createQuoteWithId()

    await seedNotification({
      quoteId: stale,
      emailType: QUOTE_RESULTS,
      status: 'temporary-failure',
      minutes: 60 * 24 * 3
    })
    await seedNotification({
      quoteId: permanent,
      emailType: QUOTE_RESULTS,
      status: 'permanent-failure',
      minutes: 30
    })

    expect(await queryFailures()).toEqual([])
  })
})
