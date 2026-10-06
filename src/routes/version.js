import { getGitHash } from '@defra/nrf-library'

const gitHash = getGitHash()

/**
 * @openapi
 * /version:
 *   get:
 *     tags:
 *       - Version
 *     summary: Service version
 *     responses:
 *       200:
 *         description: Returns the service version (git hash)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                   example: abc1234
 */
const version = {
  method: 'GET',
  path: '/version',
  options: { auth: false },
  handler: (_request, h) => h.response({ version: gitHash })
}

export { version }
