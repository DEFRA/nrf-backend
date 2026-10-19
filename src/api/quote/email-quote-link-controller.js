import Boom from '@hapi/boom'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { emailQuoteLinkPayloadSchema } from './validation/email-quote-link-payload-schema.js'
import { sendRetrieveQuoteLink } from './helpers/send-retrieve-quote-link.js'

const emailMatches = (quote, submittedEmail) =>
  quote.email.address?.toLowerCase() === submittedEmail.toLowerCase()

/**
 * @openapi
 * /quotes/email-quote-link:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Email a magic link to retrieve a saved quote
 *     description: >
 *       Looks up the quote for the reference and checks the email matches its
 *       owner (ignoring case). On a match, issues a single-use token that lasts
 *       24 hours (expiring any earlier one) and emails the magic link. Reports
 *       whether a quote matched so the caller can show the right page; both
 *       values are needed to match, which limits enumeration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reference
 *               - email
 *             properties:
 *               reference:
 *                 type: string
 *                 example: NRL-000001
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Whether a quote matched; the email was sent when true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 matched:
 *                   type: boolean
 *       400:
 *         description: Reference or email format is invalid
 *       502:
 *         description: A quote matched but the email could not be sent
 */
export const emailQuoteLinkController = {
  options: {
    validate: {
      payload: emailQuoteLinkPayloadSchema
    }
  },
  async handler(request, h) {
    const { reference, email } = request.payload
    const quote = await dbGetQuote({ db: request.pg, reference })

    if (!quote || !emailMatches(quote, email)) {
      return h.response({ matched: false }).code(statusCodes.ok)
    }

    const emailSent = await sendRetrieveQuoteLink({ db: request.pg, quote })
    if (!emailSent) {
      throw Boom.badGateway('Retrieve quote email was not sent')
    }

    return h.response({ matched: true }).code(statusCodes.ok)
  }
}
