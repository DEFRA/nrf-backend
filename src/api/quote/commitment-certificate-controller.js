import Boom from '@hapi/boom'
import { dbCreateCommitmentCertificate } from '../../services/db/quotes/create-commitment-certificate.js'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { commitmentCertificateSchema } from './validation/commitment-certificate-schema.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'

/**
 * @openapi
 * /quotes/{reference}/commitment-certificate:
 *   patch:
 *     tags:
 *       - Quote
 *     summary: Record that the commitment certificate has been created
 *     description: >
 *       Stamps the quote's commitment_certificate_created_at with the current
 *       time. This can happen once per quote: a repeat call is rejected with 409
 *       and leaves the original timestamp unchanged. 404 and 409 are
 *       distinct because the only caller is the frontend service, which sends
 *       the reference from the user's own session, so no end user can probe
 *       which references exist.
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
 *               - createCommitmentCertificate
 *             properties:
 *               createCommitmentCertificate:
 *                 type: boolean
 *                 enum: [true]
 *     responses:
 *       200:
 *         description: Commitment certificate creation recorded
 *       400:
 *         description: Reference format or body is invalid
 *       404:
 *         description: Quote not found
 *       409:
 *         description: A commitment certificate has already been created for the quote
 */
export const commitmentCertificateController = {
  options: {
    validate: {
      params: referenceParamSchema,
      payload: commitmentCertificateSchema
    }
  },
  async handler(request, h) {
    const { reference } = request.params

    const created = await dbCreateCommitmentCertificate({
      db: request.pg,
      reference
    })

    if (created) {
      return h.response().code(statusCodes.ok)
    }

    const quote = await dbGetQuote({ db: request.pg, reference })
    return quote ? Boom.conflict() : Boom.notFound()
  }
}
