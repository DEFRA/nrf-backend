import joi from 'joi'
import { sendQuoteEmail } from './helpers/send-quote-email.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { dbCreateQuote } from '../../services/db/quotes/queries.js'

/**
 * @openapi
 * /quote:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Create a quote and send confirmation email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emailAddress
 *             properties:
 *               emailAddress:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Quote created
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *             description: URL of the created quote
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reference:
 *                   type: string
 *                   example: NRF-000001
 *       400:
 *         description: Validation error
 */
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
    const quote = await dbCreateQuote({ db: request.pg })
    const emailSendResult = await sendQuoteEmail({
      nrfQuoteReference: quote.reference,
      recipientEmailAddress: request.payload.emailAddress
    })

    request.logger.info(
      `Quote email successfully sent for nrfReference: ${quote.reference}. Notify ID: ${emailSendResult?.notificationId}`
    )
    return h
      .response({ reference: quote.reference })
      .header('Location', `/quote/${quote.reference}`)
      .code(statusCodes.created)
  }
}
