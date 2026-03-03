import joi from 'joi'
import { createNrfReference } from '../../common/helpers/nrf-reference.js'
import { sendQuoteEmail } from './helpers/send-quote-email.js'
import { statusCodes } from '../../common/constants/status-codes.js'

export const postController = {
  options: {
    payload: {
      allow: 'application/json'
    },
    validate: {
      query: false,
      payload: joi.object({
        emailAddress: joi.string().email().required().messages({
          'string.empty': 'EMAIL_ADDRESS_REQUIRED',
          'string.email': 'EMAIL_ADDRESS_INVALID',
          'any.required': 'EMAIL_ADDRESS_REQUIRED'
        })
      })
    }
  },
  handler: async (request, h) => {
    const nrfQuoteReference = createNrfReference()
    const emailSendResult = await sendQuoteEmail({
      nrfQuoteReference,
      recipientEmailAddress: request.payload.emailAddress
    })
    request.logger.info(
      `Quote email successfully sent for nrfReference: ${nrfQuoteReference}. Notify ID: ${emailSendResult?.notificationId}`
    )
    return h.response({ message: 'success' }).code(statusCodes.created)
  }
}
