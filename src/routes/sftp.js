import Joi from 'joi'

import { getSsclClient } from '../services/sftp/get-sscl-client.js'
import { runSsclTestExchange } from '../services/sftp/test-exchange.js'

/**
 * @openapi
 * /sftp/test-file:
 *   post:
 *     tags:
 *       - SSCL
 *     summary: Exchange test files with SSCL
 *     description: >
 *       Pushes a PGP encrypted and signed test file to SSCL's MOVEit push
 *       folder and lists it. Then pulls every file in the pull folder:
 *       decrypts and verifies it, logs it and discards the content, and
 *       removes it from the pull folder. A file that fails any step is left
 *       in place. Only registered when SSCL_SFTP_TEST_ENABLED is on, which
 *       is refused in prod. Failed steps report ok false with no detail; see
 *       the logs. Files left for a later pull (pulled.notProcessed, for
 *       example after the 60 second pull limit) do not make ok false.
 *     responses:
 *       200:
 *         description: The outcome of each step; ok is false if any step failed
 *       401:
 *         description: Missing or invalid x-api-key
 */
const sftpTestFile = {
  method: 'POST',
  path: '/sftp/test-file',
  options: {
    validate: {
      payload: Joi.object({}).allow(null)
    }
  },
  async handler(_request, h) {
    const result = await runSsclTestExchange({
      client: await getSsclClient(),
      now: new Date()
    })
    return h.response(result)
  }
}

export { sftpTestFile }
