/**
 * Record a retry attempt against an existing quote_email_notifications row.
 * The row's retry_count is always bumped; if Notify accepted the retry, the
 * new notification_id overwrites the old one and delivery fields are reset so
 * the poller repopulates them for the fresh send. Notify-rejected retries
 * pass a null notificationId and only bump the counter.
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
    `UPDATE quote_email_notifications
        SET retry_count = retry_count + 1,
            notification_id = COALESCE($2, notification_id),
            notify_send_status = CASE WHEN $2 IS NULL THEN notify_send_status ELSE NULL END,
            status_checked_at  = CASE WHEN $2 IS NULL THEN status_checked_at  ELSE NULL END,
            sent_at            = CASE WHEN $2 IS NULL THEN sent_at            ELSE NULL END,
            completed_at       = CASE WHEN $2 IS NULL THEN completed_at       ELSE NULL END
      WHERE id = $1`,
    [id, notificationId]
  )
}
