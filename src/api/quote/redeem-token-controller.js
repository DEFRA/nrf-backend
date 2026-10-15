import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbRedeemQuoteAccessToken } from '../../services/db/quote-access-tokens/redeem-quote-access-token.js'
import { hashToken } from '../../common/helpers/token/hash-token.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { QUOTE_ACCESS_STATUS } from '@defra/nrf-library'
import { referenceParamSchema } from './validation/reference-param-schema.js'
import { tokenPayloadSchema } from './validation/token-payload-schema.js'

/**
 * @param {object} params
 * @param {import('@hapi/hapi').ResponseToolkit} params.h
 * @param {string} params.accessStatus - one of QUOTE_ACCESS_STATUS
 */
const respondWithStatus = ({ h, accessStatus }) =>
  h.response({ accessStatus }).code(statusCodes.ok)

/**
 * @openapi
 * /quotes/{reference}/redeem-token:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Redeem a single-use access token for a quote
 *     description: >
 *       Validates the access token against the quote identified by the
 *       reference. A token is single-use with a 24 hour life: redeeming it
 *       marks it used, so a second attempt reports expired. The token is sent in
 *       the body, not the URL, so it is not recorded in access logs. Always
 *       responds 200; the outcome is carried in the accessStatus field. Use
 *       GET /quotes/{reference} to read the quote.
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRL-\d{6}$
 *         example: NRL-000001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Redemption outcome
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessStatus:
 *                   type: string
 *                   enum: [valid, invalid, expired, not_found]
 *       400:
 *         description: Reference format or body is invalid
 */
export const redeemTokenController = {
  options: {
    validate: {
      params: referenceParamSchema,
      payload: tokenPayloadSchema
    }
  },
  async handler(request, h) {
    const quote = await dbGetQuote({
      db: request.pg,
      reference: request.params.reference
    })

    if (!quote) {
      return respondWithStatus({
        h,
        accessStatus: QUOTE_ACCESS_STATUS.notFound
      })
    }

    const { redeemed, expired } = await dbRedeemQuoteAccessToken({
      db: request.pg,
      tokenHash: hashToken(request.payload.token),
      quoteId: quote.id
    })

    if (redeemed) {
      return respondWithStatus({ h, accessStatus: QUOTE_ACCESS_STATUS.valid })
    }

    return respondWithStatus({
      h,
      accessStatus: expired
        ? QUOTE_ACCESS_STATUS.expired
        : QUOTE_ACCESS_STATUS.invalid
    })
  }
}
