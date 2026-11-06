import Boom from '@hapi/boom'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { compareBoundaries } from '../../services/impact-assessor/impact-assessor.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { compareBoundariesPayloadSchema } from './validation/compare-boundaries-payload-schema.js'

/**
 * @param {{ boundary: { geoJsonWgs84: string | null } } | null} quote
 * @returns {object | null} the quote's boundary GeoJSON, or null when there is none
 */
const getBoundary = (quote) =>
  quote?.boundary.geoJsonWgs84 ? JSON.parse(quote.boundary.geoJsonWgs84) : null

/**
 * @openapi
 * /quotes/compare-boundaries:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Check whether the current boundary matches an original quote's boundary
 *     description: >
 *       Looks up the original quote's saved boundary GeoJSON and sends it,
 *       with the supplied current boundary GeoJSON, to the impact assessor to
 *       compare. The current boundary is supplied by the caller because it may
 *       not be saved yet. Responds 404 when the original reference has no
 *       quote or its quote has no commitmentCertificateCreatedAt date.
 *       Responds boundariesMatch false when the original quote has no boundary.
 *       The 404 reveals whether the original reference has a committed quote;
 *       the caller needs the distinction to send the user to the right page.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - originalReference
 *               - currentBoundaryGeoJson
 *             properties:
 *               originalReference:
 *                 type: string
 *                 example: NRL-000001
 *               currentBoundaryGeoJson:
 *                 type: object
 *                 description: WGS84 GeoJSON geometry of the current boundary
 *     responses:
 *       200:
 *         description: Whether the boundaries match
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 boundariesMatch:
 *                   type: boolean
 *       400:
 *         description: Reference format or body is invalid
 *       404:
 *         description: The original reference has no quote with a commitment certificate date
 *       502:
 *         description: Impact assessor unreachable or returned an unexpected response
 *       default:
 *         description: The impact assessor's error status is passed through, with an error code in the body
 */
export const compareBoundariesController = {
  options: {
    validate: {
      payload: compareBoundariesPayloadSchema
    }
  },
  async handler(request, h) {
    const { originalReference, currentBoundaryGeoJson: boundaryNew } =
      request.payload
    const original = await dbGetQuote({
      db: request.pg,
      reference: originalReference
    })
    if (!original?.commitmentCertificateCreatedAt) {
      throw Boom.notFound(
        `No committed quote found with reference ${originalReference}`
      )
    }
    const boundaryOriginal = getBoundary(original)

    if (!boundaryOriginal) {
      return h.response({ boundariesMatch: false }).code(statusCodes.ok)
    }

    const result = await compareBoundaries({ boundaryOriginal, boundaryNew })
    if (result.error) {
      const statusCode = result.statusCode ?? statusCodes.badGateway
      return h.response({ error: result.error }).code(statusCode)
    }

    return h
      .response({ boundariesMatch: result.boundariesMatch })
      .code(statusCodes.ok)
  }
}
