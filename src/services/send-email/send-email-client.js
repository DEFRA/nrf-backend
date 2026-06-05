import { retryAsyncOperation } from '@defra/nrf-library'
import { createNotifyClient } from './notify-client.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { config } from '../../config.js'

/**
 * @param {object} params
 * @param {import('notifications-node-client').NotifyClient} params.notifyClient
 * @param {string} params.recipientEmailAddress
 * @param {string} params.emailReference
 * @param {object} params.emailBodyVariables
 * @param {string} params.templateId
 * @returns {Promise<{notificationId: string, sentDateTime: string}>}
 */
const sendEmailOperation = async ({
  notifyClient,
  recipientEmailAddress,
  emailReference,
  emailBodyVariables,
  templateId
}) => {
  const options = {
    personalisation: emailBodyVariables,
    reference: emailReference
  }
  const result = await notifyClient.sendEmail(
    templateId,
    recipientEmailAddress,
    options
  )
  const notificationId = result?.data?.id
  if (!notificationId) {
    throw new Error('No notification ID returned')
  }
  return { notificationId, sentDateTime: new Date().toISOString() }
}

/**
 * @param {object} params
 * @param {string} params.recipientEmailAddress
 * @param {string} params.emailReference
 * @param {object} params.emailBodyVariables
 * @param {string} params.templateId
 */
export const sendEmail = async ({
  recipientEmailAddress,
  emailReference,
  emailBodyVariables,
  templateId
}) => {
  const logger = createLogger()
  const notifyClient = createNotifyClient()
  const { retryAttempts, retryIntervalMs } = config.get('notify')
  try {
    const { notificationId, sentDateTime } = await retryAsyncOperation({
      operation: () =>
        sendEmailOperation({
          notifyClient,
          recipientEmailAddress,
          emailReference,
          emailBodyVariables,
          templateId
        }),
      retries: retryAttempts,
      intervalMs: retryIntervalMs,
      logger
    })
    logger.info({ templateId, notificationId }, 'Notify sendEmail responded')
    return { notificationId, sentDateTime }
  } catch (error) {
    const errors = error?.response?.data?.errors
    logger.error(
      error,
      errors
        ? `Notify client sendEmail failed: ${JSON.stringify(errors)}`
        : `Error thrown in sendEmail: ${error.message}`
    )
    return null
  }
}
