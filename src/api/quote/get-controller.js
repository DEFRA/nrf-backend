import Boom from '@hapi/boom'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'

/**
 * @openapi
 * /quotes/{reference}:
 *   get:
 *     tags:
 *       - Quote
 *     summary: Get a quote
 *     description: >
 *       Returns the quote identified by the reference. This does not check or
 *       consume an access token; use POST /quotes/{reference}/redeem-token to
 *       redeem a magic link token.
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRL-\d{6}$
 *         example: NRL-000001
 *     responses:
 *       200:
 *         description: The quote
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Reference format is invalid
 *       404:
 *         description: No quote exists for the reference
 */
export const getController = {
  options: {
    validate: {
      params: referenceParamSchema
    }
  },
  handler: async (request) => {
    const { reference } = request.params
    const quote = await dbGetQuote({ db: request.pg, reference })

    if (!quote) {
      throw Boom.notFound(`No quote found with reference ${reference}`)
    }

    return quote
  }
}
