import { createLogger } from '../../common/helpers/logging/logger.js'
import { ssclErrorCodes } from '../../common/helpers/sscl/sscl-errors.js'
import { ssclFilename } from '../../common/helpers/sscl/sscl-filename.js'
import { completedPullStatuses } from './sscl-client.js'

const logger = createLogger()
const oneSecondMs = 1000
// No new file is started after this, so a full pull folder can't hold the
// request open. It is well inside the admin-frontend's 5 minute wait.
const pullTimeLimitMs = 60000

/**
 * @typedef {import('./sscl-client.js').SsclClient} SsclClient
 * @typedef {{ client: SsclClient, now: Date }} TestExchangeParams
 */

/**
 * Runs one step of the exchange. A failed step is logged here, once, and
 * reported as `{ ok: false }` with no detail, so internal errors don't reach
 * the API response.
 * @template {{ ok: boolean }} T
 * @param {{ step: string, work: () => Promise<T> }} params
 * @returns {Promise<T | { ok: false }>}
 */
const runStep = async ({ step, work }) => {
  try {
    return await work()
  } catch (error) {
    logger.error(error, `SSCL test exchange ${step} step failed`)
    return { ok: false }
  }
}

/**
 * Pushes the test file under SSCL's invoice file name. If a file of that name
 * is already there (two pushes in the same second), tries the next second.
 * @param {TestExchangeParams} params
 */
const pushTestFile = async ({ client, now }) => {
  const data = Buffer.from(
    `NRF to SSCL connectivity test file\nSent: ${now.toISOString()}\n`
  )
  const push = async (time) => {
    const filename = ssclFilename({ fileType: 'NRLINV', time })
    await client.pushFile({ filename, data })
    return { ok: true, filename }
  }
  try {
    return await push(now)
  } catch (error) {
    if (error.code !== ssclErrorCodes.fileExists) {
      throw error
    }
    return push(new Date(now.getTime() + oneSecondMs))
  }
}

/**
 * @param {Pick<TestExchangeParams, 'client'>} params
 */
const pullTestFiles = async ({ client }) => {
  const { files, notProcessed } = await client.pullFiles({
    stopAfterMs: pullTimeLimitMs,
    async onFile({ filename, data, sha256 }) {
      logger.info(
        { sscl: { filename, decryptedSize: data.length, sha256 } },
        'SSCL test exchange pulled file, content discarded'
      )
    }
  })
  return {
    ok: files.every((file) => completedPullStatuses.has(file.status)),
    files,
    notProcessed
  }
}

/**
 * Proves connectivity with SSCL: pushes a PGP encrypted and signed test file,
 * lists the push folder, and pulls every file in the pull folder (decrypts,
 * verifies, logs and discards it, then removes it from the pull folder). Each
 * step runs even if an earlier one fails, so the result shows what works.
 * Never runs in prod: the route is refused there at startup.
 * @param {TestExchangeParams} params
 */
export async function runSsclTestExchange({ client, now }) {
  const pushed = await runStep({
    step: 'push',
    work: () => pushTestFile({ client, now })
  })
  const pushFolder = await runStep({
    step: 'list',
    work: async () => ({ ok: true, files: await client.listPushFolder() })
  })
  const pulled = await runStep({
    step: 'pull',
    work: () => pullTestFiles({ client })
  })

  const result = {
    ok: pushed.ok && pushFolder.ok && pulled.ok,
    pushed,
    pushFolder,
    pulled
  }
  logger.info({ sscl: { ok: result.ok } }, 'SSCL test exchange finished')
  return result
}
