/**
 * Record the latest delivery status fetched from GOV.UK Notify for a
 * notification row. `sent_at`/`completed_at` are Notify-side timestamps and are
 * only written when Notify supplies them (COALESCE preserves any earlier value).
 *
 * The matching attempt row (by notification id) carries the same status, so
 * the admin frontend's per-attempt history stays live. The attempt is matched
 * on the notification id the status was fetched for — not the lifecycle row's
 * current id — because the retry worker may have swapped it between fetch and
 * write; a status landing on the older attempt row is the truthful outcome.
 * Lifecycle rows created before attempts existed have no attempt rows, so the
 * update is a harmless no-op for them.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.id - quote_email_notifications.id
 * @param {string} params.notificationId - the Notify notification id the status was fetched for
 * @param {string} params.status - Notify delivery status
 * @param {string|null} [params.sentAt]
 * @param {string|null} [params.completedAt]
 */
export const dbUpdateEmailNotificationStatus = async ({
  db,
  id,
  notificationId,
  status,
  sentAt,
  completedAt
}) => {
  await db.query(
    `WITH updated AS (
       UPDATE quote_email_notifications
          SET notify_send_status = $2,
              status_checked_at = now(),
              sent_at = COALESCE($3, sent_at),
              completed_at = COALESCE($4, completed_at)
        WHERE id = $1
        RETURNING id
     )
     UPDATE quote_email_notification_attempts a
        SET notify_send_status = $2
       FROM updated
      WHERE a.notification_id = $5`,
    [id, status, sentAt ?? null, completedAt ?? null, notificationId]
  )
}
