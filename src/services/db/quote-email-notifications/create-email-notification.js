import { createLogger } from '../../../common/helpers/logging/logger.js'

/**
 * Persist a GOV.UK Notify notification id against a quote so its delivery
 * status can be polled later. One row per email lifecycle — the initial
 * quote_result send, or a user-initiated resend — retries update the existing
 * row in place rather than inserting a new one. `ON CONFLICT DO NOTHING` makes
 * this safe to re-issue for the same notification id.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {string} params.notificationId - GOV.UK Notify notification UUID
 * @param {string} [params.emailType='quote_results'] - 'quote_results' | 'resend_quote_link'
 */
export const dbCreateEmailNotification = async ({
  db,
  quoteId,
  notificationId,
  emailType = 'quote_results'
}) => {
  const logger = createLogger()

  await db.query(
    `INSERT INTO quote_email_notifications (quote_id, notification_id, email_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (notification_id) DO NOTHING`,
    [quoteId, notificationId, emailType]
  )

  logger.info(
    { quoteId, notificationId, emailType },
    'Email notification recorded'
  )
}
