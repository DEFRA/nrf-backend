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
 *                     example: NRF-000001
 */
export const getAllController = {
  handler: async (request, h) => {
    const quotes = await dbGetAllQuotes({ db: request.pg })
    return h.response(quotes)
  }
}
