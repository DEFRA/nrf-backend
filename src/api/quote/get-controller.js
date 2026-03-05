import Boom from '@hapi/boom'
import { dbGetQuote } from '../../services/db/quotes/queries.js'

export const getController = {
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
