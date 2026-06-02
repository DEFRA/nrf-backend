import joi from 'joi'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbRedeemQuoteAccessToken } from '../../services/db/quote-access-tokens/redeem-quote-access-token.js'
import { dbReadQuoteAccessToken } from '../../services/db/quote-access-tokens/read-quote-access-token.js'
import { hashToken } from '../../common/helpers/token/hash-token.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { quoteAccessStatus } from './quote-access-status.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'

const bearerPrefix = /^Bearer (.+)$/

const extractBearerToken = (authorization) =>
  authorization?.match(bearerPrefix)?.[1]

const querySchema = joi.object({
  redeem: joi.boolean().default(true)
})

/**
 * @openapi
 * /quotes/{reference}:
 *   get:
 *     tags:
 *       - Quote
 *     summary: Validate an access token and return the quote
 *     description: >
 *       Validates the bearer access token against the quote identified by the
 *       reference. By default redeems a session on success; pass redeem=false
 *       to read the quote without consuming a session (e.g. when the caller
 *       already holds a session cookie). Always responds 200; the outcome is
 *       carried in the status field.
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRF-\d{6}$
 *         example: NRF-000001
 *       - in: query
 *         name: redeem
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: When false, validate without consuming a session
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token from the quote link
 *     responses:
 *       200:
 *         description: Validation outcome
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessStatus:
 *                   type: string
 *                   enum: [valid, invalid, expired, not_found]
 *                 quote:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Reference format is invalid
 */
export const getController = {
  options: {
    validate: {
      params: referenceParamSchema,
      query: querySchema
    }
  },
  handler: async (request, h) => {
    const quote = await dbGetQuote({
      db: request.pg,
      reference: request.params.reference
    })

    if (!quote) {
      return h
        .response({ accessStatus: quoteAccessStatus.notFound, quote: null })
        .code(statusCodes.ok)
    }

    const token = extractBearerToken(request.headers.authorization)

    if (!token) {
      return h
        .response({ accessStatus: quoteAccessStatus.invalid, quote: null })
        .code(statusCodes.ok)
    }

    const tokenHash = hashToken(token)
    const args = { db: request.pg, tokenHash, quoteId: quote.id }

    const { ok, expired } = request.query.redeem
      ? await dbRedeemQuoteAccessToken(args).then((r) => ({
          ok: r.redeemed,
          expired: r.expired
        }))
      : await dbReadQuoteAccessToken(args).then((r) => ({
          ok: r.valid,
          expired: r.expired
        }))

    if (ok) {
      return h
        .response({ accessStatus: quoteAccessStatus.valid, quote })
        .code(statusCodes.ok)
    }

    return h
      .response({
        accessStatus: expired
          ? quoteAccessStatus.expired
          : quoteAccessStatus.invalid,
        quote: null
      })
      .code(statusCodes.ok)
  }
}
