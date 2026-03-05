import { createNotifyClient } from './notify-client.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

export const sendEmail = async ({
  recipientEmailAddress,
  emailReference,
  emailBodyVariables,
  templateId
}) => {
  const logger = createLogger()
  try {
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
    logger.info('Notify sendEmail responded', {
      templateId,
      notificationId
    })
    return {
      notificationId,
      sentDateTime: new Date().toISOString()
    }
  } catch (error) {
    logger.error(
      {
        templateId
      },
      `Notify sendEmail failed: ${error.message}`
    )
    return null
  }
}
