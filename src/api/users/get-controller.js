import Boom from '@hapi/boom'
import { statusCodes } from '../../common/constants/status-codes.js'
import { dbGetUser } from '../../services/db/users/get-user.js'
import { defraIdHeaderSchema } from './validation/defra-id-schema.js'

/**
 * @openapi
 * /users:
 *   get:
 *     tags:
 *       - User
 *     summary: Get a user by Defra ID
 *     description: >-
 *       Returns the stored profile for a user identified by their Defra ID sub claim, plus each
 *       organisation they are linked to with the relationship type on that link. The defra id is
 *       sent in the x-defra-id header (not the URL) so it does not appear in access logs. The
 *       response is marked Cache-Control: no-store (and Vary: x-defra-id) because the URL is
 *       shared across users, so a cache must not store or serve one user's record to another.
 *     parameters:
 *       - in: header
 *         name: x-defra-id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The user and their linked organisations
 *         headers:
 *           Cache-Control:
 *             schema:
 *               type: string
 *               example: no-store
 *           Vary:
 *             schema:
 *               type: string
 *               example: x-defra-id
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
    validate: { headers: defraIdHeaderSchema }
  },
  async handler(request, h) {
    const user = await dbGetUser({
      db: request.pg,
      defraId: request.headers['x-defra-id']
    })

    if (!user) {
      return Boom.notFound()
    }

    return h
      .response(user)
      .header('cache-control', 'no-store')
      .header('vary', 'x-defra-id')
      .code(statusCodes.ok)
  }
}
