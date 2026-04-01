import joi from 'joi'

import { findNearbyWasteWaterTreatmentWorks } from '../services/impact-assessor/impact-assessor.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * @openapi
 * /wwtw/nearby:
 *   post:
 *     tags:
 *       - WWTW
 *     summary: Find nearby waste water treatment works
 *     description: >
 *       Forwards the RLB geometry to the impact assessor to find
 *       WWTW catchments within 10km of the development boundary.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - geometry
 *             properties:
 *               geometry:
 *                 type: object
 *                 description: RLB geometry as GeoJSON
 *     responses:
 *       200:
 *         description: List of nearby WWTWs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nearbyWwtws:
 *                   type: array
 *       400:
 *         description: Invalid geometry
 *       502:
 *         description: Impact assessor service error
 */
const nearbyWasteWaterTreatmentWorksRoute = {
  method: 'POST',
  path: '/wwtw/nearby',
  options: {
    validate: {
      payload: joi.object({
        geometry: joi.object().required()
      })
    }
  },
  handler: async (request, h) => {
    const { geometry } = request.payload

    logger.info('Finding nearby WWTWs')

    const result = await findNearbyWasteWaterTreatmentWorks(geometry)

    if (result.error) {
      const statusCode = result.statusCode ?? statusCodes.badGateway
      return h.response({ error: result.error }).code(statusCode)
    }

    return h.response({ nearbyWwtws: result.nearbyWwtws })
  }
}

export { nearbyWasteWaterTreatmentWorksRoute }
