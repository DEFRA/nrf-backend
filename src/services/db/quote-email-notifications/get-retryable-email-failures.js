import { RETRYABLE_DELIVERY_STATUSES } from '../../../common/constants/notify-status.js'

// RETRYABLE_DELIVERY_STATUSES are hardcoded constants in our own code (not
// user input), so inlining them as SQL literals is safe and keeps the
// parameter list clean (same approach as get-pending-email-notifications.js).
const retryableLiterals = RETRYABLE_DELIVERY_STATUSES.map(
  (status) => `'${status}'`
).join(', ')

/**
 * Return the failed notification rows the retry worker should re-send: the
 * notification is the quote's LATEST one (no newer row exists, so user-initiated
 * resends and newer attempts suppress stale failures — rejected attempts are
 * ignored here so they never suppress the failure they belong to), it ended in
 * a retryable status within the lookback window, and the quote still has
 * budget left. `retry_count` is the attempts already made: the COUNT of the
 * quote's 'retry' rows (accepted sends) plus its 'retry_rejected' rows
 * (attempts Notify rejected), cast to int because node-postgres parses
 * COUNT(*)'s int8 as a string. Ordered oldest-first and capped at `limit` so
 * each run does bounded work.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.limit - maximum rows to return
 * @param {number} params.maxRetryAttempts - retry attempts allowed per quote
 * @param {number} params.maxAgeDays - ignore failures older than this
 * @returns {Promise<Array<{ quote_id: number, retry_count: number }>>}
 */
export const dbGetRetryableEmailFailures = async ({
  db,
  limit,
  maxRetryAttempts,
  maxAgeDays
}) => {
  const { rows } = await db.query(
    `SELECT n.quote_id, rc.retry_count
       FROM quote_email_notifications n
       JOIN LATERAL (
         SELECT COUNT(*)::int AS retry_count
           FROM quote_email_notifications r
          WHERE r.quote_id = n.quote_id
            AND r.email_type IN ('retry', 'retry_rejected')
       ) rc ON true
      WHERE n.status IN (${retryableLiterals})
        AND rc.retry_count < $2
        AND n.created_at > now() - ($3 * interval '1 day')
        AND NOT EXISTS (
          SELECT 1
            FROM quote_email_notifications newer
           WHERE newer.quote_id = n.quote_id
             AND newer.created_at > n.created_at
             AND newer.email_type <> 'retry_rejected'
        )
      ORDER BY n.created_at ASC
      LIMIT $1`,
    [limit, maxRetryAttempts, maxAgeDays]
  )
  return rows
}
