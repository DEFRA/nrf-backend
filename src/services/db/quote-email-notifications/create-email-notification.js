import { createLogger } from '../../../common/helpers/logging/logger.js'

/**
 * Persist a GOV.UK Notify notification ID against a quote so its delivery
 * status can be polled later. One row per send, which means a quote
 * accumulates several over its lifetime (the initial quote-result send plus
 * any resends). `ON CONFLICT DO NOTHING` makes this safe to retry / re-issue
 * for the same notification id. Rows with emailType 'retry_rejected' are the
 * exception: they record a retry attempt Notify rejected, so their id is
 * locally generated (not a Notify id) and their status is never polled.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {string} params.notificationId - GOV.UK Notify notification UUID, or a locally generated UUID for 'retry_rejected' rows
 * @param {string} [params.emailType='quote_result'] - 'quote_result' | 'resend' | 'retry' | 'retry_rejected'
 */
export const dbCreateEmailNotification = async ({
  db,
  quoteId,
  notificationId,
  emailType = 'quote_result'
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
