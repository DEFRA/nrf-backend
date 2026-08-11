import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { dbGetPendingEmailNotifications } from '../db/quote-email-notifications/get-pending-email-notifications.js'
import { dbUpdateEmailNotificationStatus } from '../db/quote-email-notifications/update-email-notification-status.js'
import { getNotificationStatus } from './get-notification-status.js'

const logger = createLogger()

// Session-level advisory lock keyed on a stable string so only one poller
// instance (or tick) runs at a time — CDP runs multiple instances and each
// fires the schedule independently. hashtext returns a stable int4 per string,
// avoiding any JS number-precision concerns with bigints.
const ADVISORY_LOCK_KEY = "hashtext('nrf-notify-status-poll')"

/**
 * One poll run: claim an advisory lock, fetch a bounded batch of notifications
 * whose status is still in flight, fetch each from GOV.UK Notify, and persist
 * the latest status. A failure on a single notification is logged and skipped
 * so one bad id can't abort the batch; it'll be retried on a later tick while
 * it remains non-terminal.
 *
 * Uses a single pooled client for the whole run so the session-level advisory
 * lock spans every query. The lock is session-scoped (tied to this connection),
 * so the client cannot be released during the HTTP calls without also releasing
 * the lock and losing cross-instance mutual exclusion — it is held until `finally`.
 *
 * @param {{ connect: Function, query?: Function }} pool - the `pg` pool (server.pg)
 */
export const pollNotifyEmailStatuses = async ({ pool }) => {
  const { batchSize, maxAgeDays } = config.get('notify.statusPoller')

  const client = await pool.connect()
  try {
    const { rows } = await client.query(
      `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`
    )
    if (!rows[0]?.locked) {
      logger.debug('Another poller holds the advisory lock; skipping this tick')
      return
    }

    const pending = await dbGetPendingEmailNotifications({
      db: client,
      limit: batchSize,
      maxAgeDays
    })

    logger.info({ count: pending.length }, 'Polling Notify email statuses')

    for (const { id, notification_id: notificationId } of pending) {
      let status, sentAt, completedAt
      try {
        ;({ status, sentAt, completedAt } =
          await getNotificationStatus(notificationId))
      } catch (error) {
        // Notify-side failure on a single id: skip it and try the rest. The row
        // stays non-terminal and is retried on a later tick.
        logger.error(
          { notificationId, error: error.message },
          'Notify status lookup failed; will retry next tick'
        )
        continue
      }

      try {
        await dbUpdateEmailNotificationStatus({
          db: client,
          id,
          status,
          sentAt,
          completedAt
        })
      } catch (error) {
        // DB-side failure: the pooled connection is likely dead (e.g. RDS
        // restart). Stop the batch rather than burning more Notify API calls
        // whose results could never be persisted on this connection.
        logger.error(
          { notificationId, error: error.message },
          'Failed to persist a notification status; aborting batch'
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
        'Failed to release Notify poller advisory lock'
      )
    }
    client.release(unlockError)
  }
}
