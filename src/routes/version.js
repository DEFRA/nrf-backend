import { readFileSync } from 'node:fs'

function getGitHash() {
  if (process.env.GIT_HASH) {
    return process.env.GIT_HASH
  }
  try {
    return readFileSync('src/.git-hash', 'utf-8').trim()
  } catch {
    return 'unknown'
  }
}

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
  handler: (_request, h) => h.response({ version: gitHash })
}

export { version }
