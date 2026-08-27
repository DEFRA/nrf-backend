import { TERMINAL_STATUSES } from '../../../common/constants/notify-status.js'

// TERMINAL_STATUSES are hardcoded constants in our own code (not user input),
// so inlining them as SQL literals is safe and keeps the parameter list clean.
// NOTE: the partial index `idx_qen_pending` in changelog/db.changelog-2.7.xml
// duplicates this same list in its WHERE predicate. If you add a status here,
// add a matching changeset that rebuilds that index — otherwise Postgres can no
// longer prove the index predicate implies this query's predicate and the
// poller falls back to a full scan every tick.
const terminalLiterals = TERMINAL_STATUSES.map((status) => `'${status}'`).join(
  ', '
)

/**
 * Return the notification rows the poller still needs to fetch a status for:
 * status unknown or not yet terminal, and created within the lookback window.
 * `retry_rejected` rows are skipped — they record retry attempts Notify
 * rejected, so their notification_id is locally generated and not an id Notify
 * would recognise. Ordered oldest-first and capped at `limit` so each run does
 * bounded work.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.limit - maximum rows to return
 * @param {number} params.maxAgeDays - ignore notifications older than this
 * @returns {Promise<Array<{ id: number, notification_id: string }>>}
 */
export const dbGetPendingEmailNotifications = async ({
  db,
  limit,
  maxAgeDays
}) => {
  const { rows } = await db.query(
    `SELECT id, notification_id
       FROM quote_email_notifications
      WHERE (status IS NULL OR status NOT IN (${terminalLiterals}))
        AND email_type <> 'retry_rejected'
        AND created_at > now() - ($2 * interval '1 day')
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit, maxAgeDays]
  )
  return rows
}
