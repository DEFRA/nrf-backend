import { randomUUID } from 'node:crypto'

import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { generateToken } from '../../common/helpers/token/generate-token.js'
import { dbIssueQuoteAccessToken } from '../db/quote-access-tokens/issue-quote-access-token.js'
import { dbGetQuoteById } from '../db/quotes/get-quote-by-id.js'
import { dbGetRetryableEmailFailures } from '../db/quote-email-notifications/get-retryable-email-failures.js'
import { dbCreateEmailNotification } from '../db/quote-email-notifications/create-email-notification.js'
import { sendQuoteEmail } from '../../api/quote/helpers/send-quote-email.js'
import { buildQuoteAccessLink } from '../../api/quote/helpers/build-quote-access-link.js'

const logger = createLogger()

// Session-level advisory lock keyed on a stable string so only one retry
// worker (or tick) runs at a time — CDP runs multiple instances and each
// fires the schedule independently. Deliberately a different key from the
// status poller's lock so the two jobs never contend: the worker only inserts
// new rows, the poller only updates rows it fetched.
const ADVISORY_LOCK_KEY = "hashtext('nrf-notify-email-retry')"

/**
 * Re-send the quote email for one failed notification. The quote is re-read
 * from the database so the content matches a normal send. The original raw
 * access token is never persisted (only its hash), so every retry issues a
 * fresh token and link — safe because the failed email never reached anyone,
 * and it means the re-sent link can never be stale or session-exhausted.
 *
 * A Notify rejection is recorded as a `retry_rejected` notification row with
 * a locally generated id, so the attempt still consumes the retry budget —
 * without it the quote would be retried every tick until it ages out of the
 * lookback window. The poller skips `retry_rejected` rows: Notify never
 * accepted the send, so their id is not one it would recognise. A later tick
 * tries again only while budget remains. Vanished quotes are logged and
 * skipped.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db - the locked pooled client
 * @param {number} params.quoteId
 * @param {number} params.attemptNo - retry attempt number, keeps the Notify reference unique
 */
const retryQuoteEmail = async ({ db, quoteId, attemptNo }) => {
  const quote = await dbGetQuoteById({ db, id: quoteId })
  if (!quote) {
    logger.warn({ quoteId }, 'Quote no longer exists; skipping email retry')
    return
  }

  const { raw, hash } = generateToken()

  await dbIssueQuoteAccessToken({ db, quoteId: quote.id, tokenHash: hash })

  const emailResult = await sendQuoteEmail({
    db,
    quoteId: quote.id,
    emailType: 'retry',
    recipientEmailAddress: quote.email.address,
    nrfQuoteReference: quote.reference,
    emailReference: `${quote.reference}-retry-${attemptNo}`,
    nrfServiceUrl: config.get('frontEndBaseUrl'),
    edps: quote.edps,
    housingUnits: quote.housingUnits,
    planningType: quote.planningType,
    quoteAccessLink: buildQuoteAccessLink({
      reference: quote.reference,
      rawToken: raw
    })
  })

  if (!emailResult?.sentDateTime) {
    // Notify rejected the send, so no message exists and there is no real
    // notification id. Record the attempt with a locally generated id so it
    // still consumes the retry budget — see get-retryable-email-failures.js
    // for the email types the budget counts.
    await dbCreateEmailNotification({
      db,
      quoteId,
      notificationId: randomUUID(),
      emailType: 'retry_rejected'
    })

    logger.warn(
      { quoteId, attemptNo },
      'Notify rejected the retry send; will retry on a later tick while budget remains'
    )
  }
}

/**
 * One retry run (NRF2-849): claim an advisory lock, fetch a bounded batch of
 * quotes whose latest email ended in a retryable status, and re-send the quote
 * email with a fresh access link. Each accepted send is recorded like any
 * other notification (`email_type = 'retry'`), so the status poller tracks its
 * delivery and the retry budget counts down; a Notify-rejected send is
 * recorded as a `retry_rejected` row so it consumes budget too. A DB failure
 * is presumed to be a
 * dead connection, so the batch stops rather than burning more Notify sends
 * whose notification rows could never be recorded. Once the budget is spent no
 * further attempts are made and nothing alerts — the developer must then
 * submit a new quote request with a valid address.
 *
 * Uses a single pooled client for the whole run so the session-level advisory
 * lock spans every query. The lock is session-scoped (tied to this connection)
 * and released in `finally` with the same dead-client handling as the poller.
 *
 * @param {{ connect: Function }} pool - the `pg` pool (server.pg)
 */
export const retryFailedQuoteEmails = async ({ pool }) => {
  const { batchSize, maxRetryAttempts, maxAgeDays } =
    config.get('notify.emailRetry')

  const client = await pool.connect()
  try {
    const { rows } = await client.query(
      `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`
    )
    if (!rows[0]?.locked) {
      logger.debug(
        'Another retry worker holds the advisory lock; skipping this tick'
      )
      return
    }

    const failed = await dbGetRetryableEmailFailures({
      db: client,
      limit: batchSize,
      maxRetryAttempts,
      maxAgeDays
    })

    logger.info({ count: failed.length }, 'Retrying failed quote emails')

    for (const { quote_id: quoteId, retry_count: retryCount } of failed) {
      try {
        await retryQuoteEmail({
          db: client,
          quoteId,
          attemptNo: retryCount + 1
        })
      } catch (error) {
        // DB-side failure: the pooled connection is likely dead (e.g. RDS
        // restart). Stop the batch rather than issuing more Notify sends whose
        // notification rows could never be recorded on this connection.
        logger.error(
          { quoteId, error: error.message },
          'Failed to retry quote email; aborting batch'
        )
        break
      }
    }
  } finally {
    // The advisory-unlock runs on the same connection, so it can itself throw
    // if the connection died mid-run. Catch it but always release — and pass
    // any error to release() so pg-pool destroys the dead client instead of
    // handing it to the next acquirer.
    let unlockError
    try {
      await client.query(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`)
    } catch (error) {
      unlockError = error
      logger.error(
        { error: error.message },
        'Failed to release email retry advisory lock'
      )
    }
    client.release(unlockError)
  }
}
