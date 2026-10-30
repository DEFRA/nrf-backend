import { dbGetAllQuotes } from '../../services/db/quotes/get-all-quotes.js'

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
 *                       Always true — deletion eligibility gating was removed
 *                       from the delete endpoint
 */
export const getAllController = {
  async handler(request, h) {
    const quotes = (await dbGetAllQuotes({ db: request.pg })).map((quote) => ({
      ...quote,
      deleteEligible: true
    }))

    return h.response(quotes)
  }
}
