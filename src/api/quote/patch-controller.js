import Boom from '@hapi/boom'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbUpdateQuoteWithEmailSent } from '../../services/db/quotes/update-quote-with-email-sent.js'
import { dbSaveEdpResults } from '../../services/db/quote_edp_results/queries.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { getCurrentISODateTime } from '../../common/helpers/date-time.js'
import { patchSchema } from './validation/patch-schema.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'
import { sendQuoteEmail } from './helpers/send-quote-email.js'

/**
 * @openapi
 * /quotes/{reference}:
 *   patch:
 *     tags:
 *       - Quote
 *     summary: Update a quote by reference
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRF-\d{6}$
 *         example: NRF-000001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - edps
 *             properties:
 *               edps:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - edpId
 *                     - edpName
 *                     - edpType
 *                     - impact
 *                     - levyGbp
 *                   properties:
 *                     edpId:
 *                       type: integer
 *                     edpName:
 *                       type: string
 *                     edpType:
 *                       type: string
 *                       enum: [NUTRIENT]
 *                     impact:
 *                       type: object
 *                       required:
 *                         - nitrogenTotal
 *                         - phosphorusTotal
 *                       properties:
 *                         nitrogenTotal:
 *                           $ref: '#/components/schemas/ImpactMeasurement'
 *                         phosphorusTotal:
 *                           $ref: '#/components/schemas/ImpactMeasurement'
 *                     levyGbp:
 *                       type: number
 *                       format: float
 *     responses:
 *       200:
 *         description: Quote updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quote not found
 */
export const patchController = {
  options: {
    validate: {
      params: referenceParamSchema,
      payload: patchSchema
    }
  },
  handler: async (request, h) => {
    const quote = await dbGetQuote({
      db: request.pg,
      reference: request.params.reference
    })

    if (!quote) {
      return Boom.notFound()
    }
    const {
      id,
      reference,
      email: { address },
      development,
      wasteWaterTreatmentWorksName
    } = quote
    const { edps } = request.payload
    await dbSaveEdpResults({
      db: request.pg,
      quoteId: id,
      edps,
      createdAt: getCurrentISODateTime()
    })

    const emailResult = await sendQuoteEmail({
      nrfQuoteReference: reference,
      recipientEmailAddress: address,
      edps,
      development,
      // Name is null when the user selected "I don't know" on the WWTW page
      wasteWaterTreatmentWorks:
        wasteWaterTreatmentWorksName ?? 'Not yet confirmed'
    })

    if (emailResult?.sentDateTime) {
      await dbUpdateQuoteWithEmailSent({
        db: request.pg,
        reference: quote.reference,
        data: { emailSendRequestAt: emailResult.sentDateTime }
      })
    }

    return h.response().code(statusCodes.ok)
  }
}
