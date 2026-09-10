import { dbCreateEmailNotification } from '../../../services/db/quote-email-notifications/create-email-notification.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {{ notificationId: string } | null} params.emailResult
 * @param {'quote_results' | 'resend_quote_link'} params.emailType
 */
export const recordEmailNotification = async ({
  db,
  quoteId,
  emailResult,
  emailType
}) => {
  const notificationId = emailResult?.notificationId ?? null
  try {
    await dbCreateEmailNotification({
      db,
      quoteId,
      notificationId,
      emailType
    })
  } catch (error) {
    logger.error(
      error,
      notificationId
        ? `Failed to record Notify notification id; email was sent (quoteId: ${quoteId}, notificationId: ${notificationId})`
        : `Failed to record email notification row; Notify send had already failed (quoteId: ${quoteId})`
    )
  }
}
