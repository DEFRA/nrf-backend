import Boom from '@hapi/boom'
import {
  dbCreateCommitmentCertificate,
  COMMITMENT_CERTIFICATE_CREATED,
  COMMITMENT_CERTIFICATE_NO_RESULTS
} from '../../services/db/quotes/create-commitment-certificate.js'
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
 *       time, and records the levy calculation the user accepted as a new row
 *       in the quote's calculation history (journey request_to_use), even if
 *       the amounts are unchanged. The two are written together. This can
 *       happen once per quote: a repeat call is rejected with 409
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
 *               - levy
 *             properties:
 *               createCommitmentCertificate:
 *                 type: boolean
 *                 enum: [true]
 *               levy:
 *                 type: object
 *                 description: The levy calculation returned by the impact assessor's recalculate endpoint
 *                 required:
 *                   - calculationDate
 *                   - provisionalAmount
 *                   - inflationAdjustedAmount
 *                   - baseChargePerUnit
 *                   - calculatorVersion
 *                   - units
 *                   - originalBaseAmount
 *                   - originalBaseChargePerUnit
 *                 properties:
 *                   calculationDate:
 *                     type: string
 *                     format: date-time
 *                   provisionalAmount:
 *                     type: number
 *                   inflationAdjustedAmount:
 *                     type: number
 *                   baseChargePerUnit:
 *                     type: number
 *                   calculatorVersion:
 *                     type: integer
 *                   units:
 *                     type: integer
 *                   originalBaseAmount:
 *                     type: number
 *                   originalBaseChargePerUnit:
 *                     type: number
 *     responses:
 *       200:
 *         description: Commitment certificate creation recorded
 *       400:
 *         description: Reference format or body is invalid
 *       404:
 *         description: Quote not found
 *       409:
 *         description: A commitment certificate has already been created for the quote, or the quote has no levy results to commit to
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

    const outcome = await dbCreateCommitmentCertificate({
      db: request.pg,
      reference,
      levy: request.payload.levy
    })

    if (outcome === COMMITMENT_CERTIFICATE_CREATED) {
      return h.response().code(statusCodes.ok)
    }

    if (outcome === COMMITMENT_CERTIFICATE_NO_RESULTS) {
      return Boom.conflict('The quote has no levy results to commit to')
    }

    const quote = await dbGetQuote({ db: request.pg, reference })
    return quote ? Boom.conflict() : Boom.notFound()
  }
}
