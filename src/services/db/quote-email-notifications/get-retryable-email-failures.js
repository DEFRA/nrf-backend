import { RETRYABLE_DELIVERY_STATUSES } from '../../../common/constants/notify-status.js'
import {
  QUOTE_EMAIL_TYPES,
  RETRYABLE_EMAIL_TYPES
} from '../../../common/constants/email-type.js'

// RETRYABLE_DELIVERY_STATUSES are hardcoded constants in our own code (not
// user input), so inlining them as SQL literals is safe and keeps the
// parameter list clean (same approach as get-pending-email-notifications.js).
const retryableLiterals = RETRYABLE_DELIVERY_STATUSES.map(
  (status) => `'${status}'`
).join(', ')

/**
 * Return the quote_email_notifications rows the retry worker should re-send:
 * a retryable email type, a retryable Notify delivery status, retry_count still
 * under the per-quote budget, created within the lookback window, and no newer
 * email of the same kind for the quote (a later user-initiated resend or magic
 * link request supersedes the failed lifecycle so we do not chase it any
 * further). Ordered oldest-first and capped at `limit` so each run does bounded
 * work.
 *
 * The worker re-sends each row with the template for its type — the quote
 * results template for quote email types, the retrieve template with a fresh
 * single-use token for retrieve links — so matching on RETRYABLE_EMAIL_TYPES
 * is what stops any other kind of email going out as one of those. Superseding
 * is scoped the same way: a quote email is only superseded by a newer quote
 * email (never by a retrieve link), and a retrieve link only by a newer
 * retrieve link.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.limit - maximum rows to return
 * @param {number} params.maxRetryAttempts - retry attempts allowed per row
 * @param {number} params.maxAgeDays - ignore failures older than this
 * @returns {Promise<Array<{ id: number, quote_id: number, retry_count: number, email_type: string }>>}
 */
export const dbGetRetryableEmailFailures = async ({
  db,
  limit,
  maxRetryAttempts,
  maxAgeDays
}) => {
  const { rows } = await db.query(
    `SELECT n.id, n.quote_id, n.retry_count, n.email_type
       FROM quote_email_notifications n
      WHERE n.notify_send_status IN (${retryableLiterals})
        AND n.email_type = ANY($4)
        AND n.retry_count < $2
        AND n.created_at > now() - ($3 * interval '1 day')
        AND NOT EXISTS (
          SELECT 1
            FROM quote_email_notifications newer
           WHERE newer.quote_id = n.quote_id
             AND newer.created_at > n.created_at
             AND (
                  newer.email_type = n.email_type
               OR (n.email_type = ANY($5) AND newer.email_type = ANY($5))
             )
        )
      ORDER BY n.created_at ASC
      LIMIT $1`,
    [
      limit,
      maxRetryAttempts,
      maxAgeDays,
      RETRYABLE_EMAIL_TYPES,
      QUOTE_EMAIL_TYPES
    ]
  )
  return rows
}
