import Boom from '@hapi/boom'
import joi from 'joi'
import { dbGetQuote } from '../../services/db/quotes/queries.js'
import { dbSaveEdpResults } from '../../services/db/quote_edp_results/queries.js'
import { statusCodes } from '../../common/constants/status-codes.js'

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
 *     responses:
 *       200:
 *         description: Quote updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quote not found
 */
const impactMeasurementSchema = joi.object({
  amount: joi.number().precision(2).required(),
  unit: joi.string().valid('mg/I TP').required(),
  band: joi.number().integer().min(1).max(4).required()
})

export const patchController = {
  options: {
    validate: {
      params: joi.object({
        reference: joi
          .string()
          .pattern(/^NRF-\d{6}$/)
          .required()
          .messages({
            'string.pattern.base': 'REFERENCE_INVALID',
            'any.required': 'REFERENCE_REQUIRED'
          })
      }),
      payload: joi.object({
        edps: joi
          .array()
          .items(
            joi.object({
              edpId: joi.number().integer().required(),
              edpName: joi.string().required(),
              edpType: joi.string().valid('NUTRIENT').required(),
              impact: joi
                .object({
                  nitrogenTotal: impactMeasurementSchema.required(),
                  phosphorusTotal: impactMeasurementSchema.required()
                })
                .required(),
              levyGbp: joi.number().precision(2).required()
            })
          )
          .required()
      })
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

    await dbSaveEdpResults({
      db: request.pg,
      quoteId: quote.id,
      edps: request.payload.edps
    })

    return h.response().code(statusCodes.ok)
  }
}
