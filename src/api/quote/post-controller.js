import { sendQuoteEmail } from './helpers/send-quote-email.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { dbCreateQuote } from '../../services/db/quotes/queries.js'
import { quoteSchema } from './validation/validation-schema.js'

/**
 * @openapi
 * /quotes:
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
 *               - boundaryEntryType
 *               - developmentTypes
 *               - email
 *             properties:
 *               boundaryEntryType:
 *                 type: string
 *                 enum: [draw, upload]
 *               developmentTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [housing, other-residential]
 *               residentialBuildingCount:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 999999
 *                 description: Required when developmentTypes includes housing
 *               peopleCount:
 *                 type: integer
 *                 minimum: 1
 *                 description: Required when developmentTypes includes other-residential
 *               email:
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
      payload: quoteSchema
    }
  },
  handler: async (request, h) => {
    const quote = await dbCreateQuote({
      db: request.pg,
      quoteData: request.payload
    })
    const emailSendResult = await sendQuoteEmail({
      nrfQuoteReference: quote.reference,
      recipientEmailAddress: request.payload.email
    })

    request.logger.info(
      `Quote email successfully sent for nrfReference: ${quote.reference}. Notify ID: ${emailSendResult?.notificationId}`
    )
    return h
      .response({ reference: quote.reference })
      .header('Location', `/quotes/${quote.reference}`)
      .code(statusCodes.created)
  }
}
