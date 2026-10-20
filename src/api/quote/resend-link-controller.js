import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbIsQuoteAccessTokenSpent } from '../../services/db/quote-access-tokens/is-quote-access-token-spent.js'
import { hashToken } from '../../common/helpers/token/hash-token.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'
import { tokenPayloadSchema } from './validation/token-payload-schema.js'
import { sendRetrieveQuoteLink } from './helpers/send-retrieve-quote-link.js'

const logger = createLogger()

/**
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {string} params.reference
 * @param {string} params.token - the raw token from an earlier magic link
 * @returns {Promise<object | null>} the quote when the token is spent and belongs to it
 */
const findQuoteForSpentToken = async ({ db, reference, token }) => {
  const quote = await dbGetQuote({ db, reference })
  if (!quote) {
    return null
  }

  const spent = await dbIsQuoteAccessTokenSpent({
    db,
    tokenHash: hashToken(token),
    quoteId: quote.id
  })
  return spent ? quote : null
}

/**
 * @openapi
 * /quotes/{reference}/resend-link:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Email a new magic link in exchange for a spent one
 *     description: >
 *       The caller proves they held an earlier magic link for this quote by
 *       sending its token, which must be used, timed out or replaced. On a
 *       match, issues a new single-use token that lasts 24 hours (expiring any
 *       earlier one), emails the magic link to the quote owner and returns
 *       that address so the caller can show where it was sent. Holding the
 *       token is what allows the address to be returned; a reference alone
 *       never reveals it. An unknown reference, an unknown token and a token
 *       that is still live all give the same response, so a caller cannot
 *       tell them apart. The token is in the body so it stays out of access
 *       logs.
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRL-\d{6}$
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
 *         description: Whether the token matched; the email was sent when true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 matched:
 *                   type: boolean
 *                 email:
 *                   type: string
 *                   description: The address the link was sent to; only when matched
 *       400:
 *         description: Reference format or body is invalid
 */
export const resendLinkController = {
  options: {
    validate: {
      params: referenceParamSchema,
      payload: tokenPayloadSchema
    }
  },
  async handler(request, h) {
    const quote = await findQuoteForSpentToken({
      db: request.pg,
      reference: request.params.reference,
      token: request.payload.token
    })

    if (!quote) {
      return h.response({ matched: false }).code(statusCodes.ok)
    }

    const emailSent = await sendRetrieveQuoteLink({ db: request.pg, quote })
    if (!emailSent) {
      // Recorded without a Notify id so the failed send can be retried later.
      logger.warn(
        { quoteId: quote.id },
        'Resent retrieve quote email was not sent; responding as if it was'
      )
    }

    return h
      .response({ matched: true, email: quote.email.address })
      .code(statusCodes.ok)
  }
}
