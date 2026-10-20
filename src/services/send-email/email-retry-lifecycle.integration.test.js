import { randomUUID } from 'node:crypto'

import { createNotifyClient } from './notify-client.js'
import { config } from '../../config.js'
import { sendRetrieveQuoteEmailWithFreshToken } from '../../api/quote/helpers/send-retrieve-quote-email-with-fresh-token.js'
import { dbGetRetryableEmailFailures } from '../db/quote-email-notifications/get-retryable-email-failures.js'
import { dbUpdateEmailNotificationForRetry } from '../db/quote-email-notifications/update-email-notification-for-retry.js'
import { dbUpdateEmailNotificationStatus } from '../db/quote-email-notifications/update-email-notification-status.js'
import { dbGetQuote } from '../db/quotes/get-quote.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  redeemToken,
  sendEmailQuoteLinkRequest
} from '../../test-utils/quote-request-helpers.js'
import { EMAIL_TYPE_RETRIEVE_QUOTE_LINK } from '../../common/constants/email-type.js'

vi.mock('./notify-client.js')
vi.mock('../sns/publish-event.js')

const OWNER_EMAIL = 'developer@housebuilder.com'

// Integration files run in parallel against one database. Retryable-failure
// rows are shared global state (the worker selects them across all quotes), so
// every suite that stages or sweeps them takes this lock: this file while it
// holds a staged failure, get-retryable-email-failures.test.js around its
// opening sweep. The worker itself is covered by unit tests; this file drives
// the same per-row calls the worker makes, on one locked client.
const FIXTURE_LOCK =
  "pg_advisory_xact_lock(hashtext('nrf-retryable-email-fixture'))"

describe('retrieve quote link retry lifecycle with a real database', () => {
  const getServer = setupTestServer()
  let notifySendEmail

  beforeEach(() => {
    notifySendEmail = vi
      .fn()
      .mockImplementation(async () => ({ data: { id: randomUUID() } }))
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: notifySendEmail
    })
  })

  it('retries a failed retrieve quote link with a fresh usable token, keeping every attempt visible', async () => {
    const server = getServer()
    const { reference } = JSON.parse((await createQuote(server)).payload)
    await sendEmailQuoteLinkRequest({ server, reference, email: OWNER_EMAIL })

    const client = await server.pg.connect()
    let initial
    let notificationId
    try {
      await client.query('BEGIN')
      await client.query(`SELECT ${FIXTURE_LOCK}`)

      // the poller reports a retryable failure for the initial send
      const rows = (
        await client.query(
          `SELECT n.* FROM quote_email_notifications n
             JOIN quotes q ON q.id = n.quote_id
            WHERE q.reference = $1 AND n.email_type = $2`,
          [reference, EMAIL_TYPE_RETRIEVE_QUOTE_LINK]
        )
      ).rows
      initial = rows[0]
      await dbUpdateEmailNotificationStatus({
        db: client,
        id: initial.id,
        notificationId: initial.notification_id,
        status: 'temporary-failure'
      })

      // the retry worker's two per-row calls, on the same locked client
      const { batchSize, maxRetryAttempts, maxAgeDays } = config.get(
        'notify.retrySendingEmails'
      )
      const failed = await dbGetRetryableEmailFailures({
        db: client,
        limit: batchSize,
        maxRetryAttempts,
        maxAgeDays
      })
      const mine = failed.find((r) => r.id === initial.id)
      expect(mine).toMatchObject({
        quote_id: initial.quote_id,
        email_type: EMAIL_TYPE_RETRIEVE_QUOTE_LINK
      })

      const quote = await dbGetQuote({ db: client, reference })
      const emailResult = await sendRetrieveQuoteEmailWithFreshToken({
        db: client,
        quote
      })
      notificationId = emailResult.notificationId
      await dbUpdateEmailNotificationForRetry({
        db: client,
        id: initial.id,
        notificationId
      })
      // once the poller delivers a status it lands on the matching attempt
      await dbUpdateEmailNotificationStatus({
        db: client,
        id: initial.id,
        notificationId,
        status: 'delivered'
      })

      await client.query('COMMIT')
    } finally {
      client.release()
    }

    // the retry send went out on the retrieve template with a fresh token
    expect(notifySendEmail).toHaveBeenCalledTimes(2)
    const retryOptions = notifySendEmail.mock.calls.at(-1)[2]
    const retryToken = retryOptions.personalisation.retrieveQuoteUrl
      .split('/')
      .pop()
    expect(
      (await redeemToken({ server, reference, token: retryToken })).accessStatus
    ).toBe('valid')

    const quote = await dbGetQuote({ db: server.pg, reference })
    const notification = quote.emailNotifications.find(
      (n) => n.emailType === EMAIL_TYPE_RETRIEVE_QUOTE_LINK
    )
    expect(notification.sendRetryCount).toBe(1)
    expect(notification.notificationId).toBe(notificationId)
    expect(notification.attempts).toEqual([
      {
        attemptNo: 1,
        notificationId: initial.notification_id,
        notifySendStatus: 'temporary-failure',
        attemptedAt: expect.any(String),
        // no Notify API key in the test environment, so no dashboard link
        notifyStatusUrl: null
      },
      {
        attemptNo: 2,
        notificationId,
        notifySendStatus: 'delivered',
        attemptedAt: expect.any(String),
        notifyStatusUrl: null
      }
    ])
  })
})
