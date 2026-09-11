import { RETRYABLE_DELIVERY_STATUSES } from '../../../common/constants/notify-status.js'

// RETRYABLE_DELIVERY_STATUSES are hardcoded constants in our own code (not
// user input), so inlining them as SQL literals is safe and keeps the
// parameter list clean (same approach as get-pending-email-notifications.js).
const retryableLiterals = RETRYABLE_DELIVERY_STATUSES.map(
  (status) => `'${status}'`
).join(', ')

/**
 * Return the quote_email_notifications rows the retry worker should re-send:
 * a retryable Notify delivery status, retry_count still under the per-quote
 * budget, created within the lookback window, and no newer row for the same
 * quote (a later user-initiated resend supersedes the failed lifecycle so we
 * do not chase it any further). Ordered oldest-first and capped at `limit`
 * so each run does bounded work.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.limit - maximum rows to return
 * @param {number} params.maxRetryAttempts - retry attempts allowed per row
 * @param {number} params.maxAgeDays - ignore failures older than this
 * @returns {Promise<Array<{ id: number, quote_id: number, retry_count: number }>>}
 */
export const dbGetRetryableEmailFailures = async ({
  db,
  limit,
  maxRetryAttempts,
  maxAgeDays
}) => {
  const { rows } = await db.query(
    `SELECT n.id, n.quote_id, n.retry_count
       FROM quote_email_notifications n
      WHERE n.notify_send_status IN (${retryableLiterals})
        AND n.retry_count < $2
        AND n.created_at > now() - ($3 * interval '1 day')
        AND NOT EXISTS (
          SELECT 1
            FROM quote_email_notifications newer
           WHERE newer.quote_id = n.quote_id
             AND newer.created_at > n.created_at
        )
      ORDER BY n.created_at ASC
      LIMIT $1`,
    [limit, maxRetryAttempts, maxAgeDays]
  )
  return rows
}
