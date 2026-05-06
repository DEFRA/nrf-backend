import { retryAsyncOperation } from '@defra/nrf-library'
import { createNotifyClient } from './notify-client.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const RETRY_INTERVAL_MS = 10000

/**
 * @param {object} params
 * @param {string} params.recipientEmailAddress
 * @param {string} params.emailReference
 * @param {object} params.emailBodyVariables
 * @param {string} params.templateId
 * @returns {Promise<{notificationId: string, sentDateTime: string}>}
 */
const sendEmailOperation = async ({
  recipientEmailAddress,
  emailReference,
  emailBodyVariables,
  templateId
}) => {
  const notifyClient = createNotifyClient()
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
  try {
    const { notificationId, sentDateTime } = await retryAsyncOperation({
      operation: () =>
        sendEmailOperation({
          recipientEmailAddress,
          emailReference,
          emailBodyVariables,
          templateId
        }),
      intervalMs: RETRY_INTERVAL_MS,
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
