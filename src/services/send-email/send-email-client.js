import { createNotifyClient } from './notify-client.js'

export const sendEmail = async ({
  recipientEmailAddress,
  emailReference,
  emailBodyVariables,
  templateId,
  logger
}) => {
  const notifyClient = createNotifyClient()
  const options = {
    personalisation: emailBodyVariables,
    reference: emailReference
  }
  try {
    const result = await notifyClient.sendEmail(
      templateId,
      recipientEmailAddress,
      options
    )
    if (!result?.id) {
      throw new Error('No notification ID returned')
    }
    logger.info('Notify sendEmail responded', {
      templateId,
      notificationId: result.id
    })
    return {
      notificationId: result.id,
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
