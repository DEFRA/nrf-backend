/**
 * Record the latest delivery status fetched from GOV.UK Notify for a
 * notification row. `sent_at`/`completed_at` are Notify-side timestamps and are
 * only written when Notify supplies them (COALESCE preserves any earlier value).
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.id - quote_email_notifications.id
 * @param {string} params.status - Notify delivery status
 * @param {string|null} [params.sentAt]
 * @param {string|null} [params.completedAt]
 */
export const dbUpdateEmailNotificationStatus = async ({
  db,
  id,
  status,
  sentAt,
  completedAt
}) => {
  await db.query(
    `UPDATE quote_email_notifications
        SET status = $2,
            status_checked_at = now(),
            sent_at = COALESCE($3, sent_at),
            completed_at = COALESCE($4, completed_at)
      WHERE id = $1`,
    [id, status, sentAt ?? null, completedAt ?? null]
  )
}
