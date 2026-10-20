/**
 * Record a retry attempt against an existing quote_email_notifications row.
 * The row's retry_count is always bumped; if Notify accepted the retry, the
 * new notification_id overwrites the old one and delivery fields are reset so
 * the poller repopulates them for the fresh send. Notify-rejected retries
 * pass a null notificationId and only bump the counter.
 *
 * The retry's attempt row is written in the same statement (attempt_no = the
 * post-increment retry_count plus one — attempt 1 is the initial send, so the
 * first retry is attempt 2 — and its notification_id is null when Notify
 * rejected it), so a lifecycle row's retry budget and attempt history can
 * never drift apart.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.id - quote_email_notifications.id of the row to update
 * @param {string|null} params.notificationId - new Notify id, or null if Notify rejected the retry
 */
export const dbUpdateEmailNotificationForRetry = async ({
  db,
  id,
  notificationId
}) => {
  await db.query(
    `WITH updated AS (
       UPDATE quote_email_notifications
          SET retry_count = retry_count + 1,
              notification_id = COALESCE($2, notification_id),
              notify_send_status = CASE WHEN $2 IS NULL THEN notify_send_status ELSE NULL END,
              status_checked_at  = CASE WHEN $2 IS NULL THEN status_checked_at  ELSE NULL END,
              sent_at            = CASE WHEN $2 IS NULL THEN sent_at            ELSE NULL END,
              completed_at       = CASE WHEN $2 IS NULL THEN completed_at       ELSE NULL END
        WHERE id = $1
        RETURNING id, retry_count
     )
     INSERT INTO quote_email_notification_attempts (email_notification_id, attempt_no, notification_id)
     SELECT id, retry_count + 1, $2 FROM updated`,
    [id, notificationId]
  )
}
