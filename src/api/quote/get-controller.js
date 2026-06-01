import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbRedeemQuoteAccessToken } from '../../services/db/quote-access-tokens/redeem-quote-access-token.js'
import { hashToken } from '../../common/helpers/token/hash-token.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { quoteAccessStatus } from './quote-access-status.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'

const bearerPrefix = /^Bearer (.+)$/

const extractBearerToken = (authorization) =>
  authorization?.match(bearerPrefix)?.[1]

/**
 * @openapi
 * /quotes/{reference}:
 *   get:
 *     tags:
 *       - Quote
 *     summary: Validate an access token and return the quote
 *     description: >
 *       Validates the bearer access token against the quote identified by the
 *       reference (tech spec §4.1 steps 4-5) and redeems a session on success.
 *       Always responds 200; the outcome is carried in the status field.
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRF-\d{6}$
 *         example: NRF-000001
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
 *                 status:
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
      params: referenceParamSchema
    }
  },
  handler: async (request, h) => {
    const quote = await dbGetQuote({
      db: request.pg,
      reference: request.params.reference
    })

    if (!quote) {
      return h
        .response({ status: quoteAccessStatus.notFound, quote: null })
        .code(statusCodes.ok)
    }

    const token = extractBearerToken(request.headers.authorization)

    if (!token) {
      return h
        .response({ status: quoteAccessStatus.invalid, quote: null })
        .code(statusCodes.ok)
    }

    const { redeemed, expired } = await dbRedeemQuoteAccessToken({
      db: request.pg,
      tokenHash: hashToken(token),
      quoteId: quote.id
    })

    if (redeemed) {
      return h
        .response({ status: quoteAccessStatus.valid, quote })
        .code(statusCodes.ok)
    }

    return h
      .response({
        status: expired ? quoteAccessStatus.expired : quoteAccessStatus.invalid,
        quote: null
      })
      .code(statusCodes.ok)
  }
}
