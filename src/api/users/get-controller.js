import Boom from '@hapi/boom'
import { statusCodes } from '../../common/constants/status-codes.js'
import { dbGetUser } from '../../services/db/users/get-user.js'
import { defraIdParamSchema } from './validation/defra-id-param-schema.js'

/**
 * @openapi
 * /users/{defraId}:
 *   get:
 *     tags:
 *       - User
 *     summary: Get a user by Defra ID
 *     description: >-
 *       Returns the stored profile for a user identified by their Defra ID sub claim, plus each
 *       organisation they are linked to with the relationship type on that link. The defra id is
 *       in the path (not PII).
 *     parameters:
 *       - in: path
 *         name: defraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The user and their linked organisations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 defraId:
 *                   type: string
 *                 email:
 *                   type: string
 *                   format: email
 *                 firstName:
 *                   type: [string, 'null']
 *                 lastName:
 *                   type: [string, 'null']
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: [string, 'null']
 *                   format: date-time
 *                 firstSignedInAt:
 *                   type: [string, 'null']
 *                   format: date-time
 *                 organisations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       defraId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       relationshipType:
 *                         type: [string, 'null']
 *                         enum: [Citizen, Employee, Agent]
 *       400:
 *         description: Validation error
 *       404:
 *         description: No user with that Defra ID
 */
export const getController = {
  options: {
    validate: { params: defraIdParamSchema }
  },
  async handler(request, h) {
    const user = await dbGetUser({
      db: request.pg,
      defraId: request.params.defraId
    })

    if (!user) {
      return Boom.notFound()
    }

    return h.response(user).code(statusCodes.ok)
  }
}
