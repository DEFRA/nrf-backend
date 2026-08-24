import joi from 'joi'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'
import { resendQuoteLink } from './helpers/resend-quote-link.js'

const genericMessage = "If a matching quote is found, we've sent a new link."

// TLD allow-list disabled so backend email validation matches the frontend's.
// If the two disagree, an address the frontend accepts can be rejected here with
// a 400, breaking the uniform "matching quote" response and leaking that the
// address format was treated differently.
const resendUnknownPayloadSchema = joi.object({
  email: joi
    .string()
    .email({ tlds: { allow: false } })
    .max(256)
    .required()
})

const emailMatches = (quote, submittedEmail) =>
  quote.email.address?.toLowerCase() === submittedEmail.toLowerCase()

/**
 * @openapi
 * /quotes/{reference}/resend-unknown:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Resend a quote access link for an unrecognised expired link
 *     description: >
 *       Used when there is no proof of ownership (the link is unknown), so the
 *       user must supply the email used for the quote. Sends a fresh link only
 *       when the email matches the quote owner, but always returns an identical
 *       response body so the caller cannot tell whether a matching quote or
 *       email exists.
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
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Generic, non-revealing success response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Reference format or body is invalid
 */
export const resendUnknownController = {
  options: {
    validate: {
      params: referenceParamSchema,
      payload: resendUnknownPayloadSchema
    }
  },
  async handler(request, h) {
    const quote = await dbGetQuote({
      db: request.pg,
      reference: request.params.reference
    })

    if (quote && emailMatches(quote, request.payload.email)) {
      await resendQuoteLink({ db: request.pg, quote })
    }

    // Always respond identically so the response body never reveals whether a
    // matching quote or email exists.
    return h
      .response({ ok: true, message: genericMessage })
      .code(statusCodes.ok)
  }
}
