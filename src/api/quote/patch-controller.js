import Boom from '@hapi/boom'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbUpdateQuoteWithEmailSent } from '../../services/db/quotes/update-quote-with-email-sent.js'
import { dbIssueQuoteAccessToken } from '../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { generateToken } from '../../common/helpers/token/generate-token.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { config } from '../../config.js'
import { patchSchema } from './validation/patch-schema.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'
import { sendQuoteEmail } from './helpers/send-quote-email.js'
import { saveOrUpdateEdpResults } from './helpers/save-or-update-edp-results.js'

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

    const anyUpdated = await saveOrUpdateEdpResults({
      db: request.pg,
      quoteId: id,
      edps
    })

    if (anyUpdated) {
      const { raw, hash } = generateToken()

      await dbIssueQuoteAccessToken({
        db: request.pg,
        quoteId: id,
        tokenHash: hash
      })

      const frontEndBaseUrl = config.get('frontEndBaseUrl')
      const quoteAccessLink = `${frontEndBaseUrl}/quote/${reference}/${raw}`

      const emailResult = await sendQuoteEmail({
        nrfQuoteReference: reference,
        nrfServiceUrl: frontEndBaseUrl,
        recipientEmailAddress: address,
        edps,
        development,
        wasteWaterTreatmentWorks: wasteWaterTreatmentWorksName,
        quoteAccessLink
      })

      if (emailResult?.sentDateTime) {
        await dbUpdateQuoteWithEmailSent({
          db: request.pg,
          reference: quote.reference,
          data: { emailSendRequestAt: emailResult.sentDateTime }
        })
      }
    }

    return h.response().code(statusCodes.ok)
  }
}
