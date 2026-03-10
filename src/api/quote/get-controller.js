import Boom from '@hapi/boom'
import joi from 'joi'
import { dbGetQuote } from '../../services/db/quotes/queries.js'

/**
 * @openapi
 * /quote/{reference}:
 *   get:
 *     tags:
 *       - Quote
 *     summary: Get a quote by reference
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRF-\d{6}$
 *         example: NRF-000001
 *     responses:
 *       200:
 *         description: Quote found
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
 *       404:
 *         description: Quote not found
 */
export const getController = {
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

    return h.response({ reference: quote.reference })
  }
}
