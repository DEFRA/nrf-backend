import Boom from '@hapi/boom'
import joi from 'joi'
import { dbGetQuote } from '../../services/db/quotes/queries.js'

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
