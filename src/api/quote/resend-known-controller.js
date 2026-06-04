import joi from 'joi'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbReadQuoteAccessToken } from '../../services/db/quote-access-tokens/read-quote-access-token.js'
import { hashToken } from '../../common/helpers/token/hash-token.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'
import { resendQuoteLink } from './helpers/resend-quote-link.js'
import { maskEmail } from './helpers/mask-email.js'

const resendKnownPayloadSchema = joi.object({
  token: joi.string().max(256).required()
})

/**
 * @openapi
 * /quotes/{reference}/resend-known:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Resend a quote access link for a recognised expired link
 *     description: >
 *       Used when the caller already holds the (now expired) access token for a
 *       quote, so possession of the token is treated as proof of ownership and
 *       no email entry is required. Verifies the token belongs to the quote
 *       regardless of expiry, then issues a fresh token and emails a new link.
 *       Always responds 200 with a deliberately uninformative shape; the masked
 *       email is only returned on the success path.
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRF-\d{6}$
 *         example: NRF-000001
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
 *         description: Generic success response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: Reference format or body is invalid
 */
export const resendKnownController = {
  options: {
    validate: {
      params: referenceParamSchema,
      payload: resendKnownPayloadSchema
    }
  },
  async handler(request, h) {
    const quote = await dbGetQuote({
      db: request.pg,
      reference: request.params.reference
    })

    if (quote) {
      const tokenHash = hashToken(request.payload.token)
      // Accept an expired row here — an expired link is the expected case for
      // this flow. Existence + quote_id match (live OR expired) is enough.
      const { valid, expired } = await dbReadQuoteAccessToken({
        db: request.pg,
        tokenHash,
        quoteId: quote.id
      })

      if (valid || expired) {
        await resendQuoteLink({ db: request.pg, quote })
        return h
          .response({
            ok: true,
            message: `We've sent a new link to ${maskEmail(quote.email.address)}`
          })
          .code(statusCodes.ok)
      }
    }

    // Generic response on any miss (no quote, or token absent/mismatched) so we
    // don't reveal whether the quote or token exists.
    return h.response({ ok: true }).code(statusCodes.ok)
  }
}
