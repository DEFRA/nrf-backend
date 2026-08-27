import Boom from '@hapi/boom'
import { statusCodes } from '../../common/constants/status-codes.js'
import { dbUpdateUser } from '../../services/db/users/update-user.js'
import { userPatchSchema } from './validation/patch-schema.js'

/**
 * @openapi
 * /users:
 *   patch:
 *     tags:
 *       - User
 *     summary: Save a signed-in user's Defra ID profile
 *     description: >-
 *       Updates the existing user row for this defra id, first merging any existing
 *       email-only record created when a quote was started before sign-in, and, when an
 *       organisation is present, upserts the organisation and user/organisation link. Called
 *       by nrf-frontend once per session when the user first hits an authenticated route. The
 *       defra id and email both stay in the body so they never appear in URLs or access logs.
 *       Returns 404 if no matching user row exists yet.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - defraId
 *               - email
 *               - firstName
 *               - lastName
 *             properties:
 *               defraId:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               organisationDefraId:
 *                 type: string
 *               organisationName:
 *                 type: string
 *               relationshipType:
 *                 type: string
 *                 enum: [Citizen, Employee, Agent]
 *     responses:
 *       204:
 *         description: User saved
 *       400:
 *         description: Validation error
 *       404:
 *         description: No user found for this defra id
 */
export const patchController = {
  options: {
    validate: {
      payload: userPatchSchema
    }
  },
  async handler(request, h) {
    const result = await dbUpdateUser({
      db: request.pg,
      ...request.payload
    })

    if (!result) {
      return Boom.notFound()
    }

    return h.response().code(statusCodes.noContent)
  }
}
