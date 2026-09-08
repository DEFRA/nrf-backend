import { dbGetAllQuotes } from '../../services/db/quotes/get-all-quotes.js'
import { canDeleteQuote } from './helpers/can-delete-quote.js'
import { config } from '../../config.js'

/**
 * @openapi
 * /quotes:
 *   get:
 *     tags:
 *       - Quote
 *     summary: Get all quotes
 *     responses:
 *       200:
 *         description: List of all quotes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                   reference:
 *                     type: string
 *                     example: NRL-000001
 *                   deleteEligible:
 *                     type: boolean
 *                     description: >
 *                       Whether the quote may be deleted in the current
 *                       environment (false in production unless created with
 *                       an approved internal email address)
 */
export const getAllController = {
  async handler(request, h) {
    const patterns = config.get('quoteDelete.eligibleEmailPatterns')
    const isProd = config.get('cdpEnvironment') === 'prod'

    const quotes = (await dbGetAllQuotes({ db: request.pg })).map((quote) => ({
      ...quote,
      deleteEligible: canDeleteQuote({
        email: quote.email?.address,
        patterns,
        isProd
      })
    }))

    return h.response(quotes)
  }
}
