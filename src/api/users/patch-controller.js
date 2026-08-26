import { audit } from '@defra/cdp-auditing'
import { auditEvents } from '../../common/constants/audit-events.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { dbSaveUser } from '../../services/db/users/save-user.js'
import { defraIdParamSchema } from './validation/defra-id-param-schema.js'
import { userPatchSchema } from './validation/patch-schema.js'

/**
 * @openapi
 * /users/{defraId}:
 *   patch:
 *     tags:
 *       - User
 *     summary: Save a signed-in user's Defra ID profile
 *     description: >-
 *       Upserts the user by defra id (merging any existing email-only record created when a
 *       quote was started before sign-in) and, when an organisation is present, upserts the
 *       organisation and user/organisation link. Called by nrf-frontend once per session when
 *       the user first hits an authenticated route. The defra id is in the path (not PII);
 *       the email stays in the body so it never appears in URLs or access logs.
 *     parameters:
 *       - in: path
 *         name: defraId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - firstName
 *               - lastName
 *             properties:
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
 */
export const patchController = {
  options: {
    validate: {
      params: defraIdParamSchema,
      payload: userPatchSchema
    }
  },
  async handler(request, h) {
    const result = await dbSaveUser({
      db: request.pg,
      defraId: request.params.defraId,
      ...request.payload
    })

    if (result.userCreated) {
      audit({
        event: {
          category: auditEvents.user.category,
          action: auditEvents.user.createUser
        },
        context: { user: { id: result.userId, email: request.payload.email } }
      })
    }

    return h.response().code(statusCodes.noContent)
  }
}
