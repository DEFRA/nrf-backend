import { createHash } from 'node:crypto'

import { createLogger } from '../../common/helpers/logging/logger.js'
import { withTimeout } from '../../common/helpers/with-timeout.js'
import {
  decryptAndVerify,
  encryptAndSign
} from '../../common/helpers/sscl/pgp.js'
import {
  isFileLevelError,
  isNoSuchFileError,
  ssclError,
  ssclErrorCodes
} from '../../common/helpers/sscl/sscl-errors.js'

import { partialSuffix } from './partial-suffix.js'

const logger = createLogger()

/**
 * @typedef {import('./sftp-transport.js').SsclTransport} SsclTransport
 * @typedef {import('./sftp-transport.js').PullSession} PullSession
 * @typedef {import('./sftp-transport.js').SsclFile} SsclFile
 * @typedef {import('./sftp-client.js').SftpFile} SftpFile
 */

/**
 * ASCII-armoured PGP keys used to exchange files with SSCL.
 * @typedef {object} SsclPgpKeys
 * @property {string} nrfPrivateKey - signs files we push, decrypts files we pull
 * @property {string} nrfPassphrase
 * @property {string} ssclEncryptionPublicKey - files we push are encrypted to this
 * @property {string} ssclSigningPublicKey - files we pull must be signed by this
 */

/**
 * @typedef {object} SsclLimits
 * @property {number} maxFileBytes - larger pulled files are left unread, and
 *   larger files are not pushed, until SSCL's own limit is known
 * @property {number} maxFilesPerRun - the rest are left for a later pull
 */

/**
 * What happened to a file in the pull folder. Only a `received` file has been
 * handed to onFile and removed from the pull folder; any other is left there,
 * except `gone`, which was no longer there to pull: the sender renamed it or
 * another pull took it, so nothing is lost.
 * @typedef {'received' | 'gone' | 'too-large' | 'download-failed' | 'changed' | 'unverified' | 'not-stored' | 'not-deleted'} PullStatus
 */

/**
 * The statuses of a file that needs no attention: received, or gone before it
 * could be pulled, which loses nothing.
 */
export const completedPullStatuses = new Set(['received', 'gone'])

/**
 * @typedef {object} PulledFile
 * @property {string} filename
 * @property {number} size
 * @property {PullStatus} status
 * @property {string} [sha256] - of the file as pulled, still encrypted
 * @property {number} [decryptedSize]
 */

/**
 * @typedef {object} PullResult
 * @property {PulledFile[]} files - in the order tried: files not seen failing
 *   before first, then those that failed on an earlier pull, each by name
 * @property {number} notProcessed - files left for a later pull, because of
 *   maxFilesPerRun, stopAfterMs or a lost connection
 */

/** How long onFile may take before the file counts as not stored. */
export const defaultStoreTimeoutMs = 30000

/**
 * Stores a pulled file. The file is only removed from the pull folder once
 * this resolves. It must be idempotent, keyed on filename and sha256: a file
 * is handed over again if its removal fails, if two backend instances pull
 * it at once, or if this takes longer than the store time limit, after which
 * the pull carries on without it but this may still finish later.
 * @typedef {(file: SsclFile & { sha256: string }) => Promise<void>} OnPulledFile
 */

/**
 * @typedef {object} PullContext
 * @property {PullSession} session
 * @property {SsclPgpKeys} keys
 * @property {SsclLimits} limits
 * @property {OnPulledFile} onFile
 * @property {number} storeTimeoutMs
 * @property {number} stopAt - no new file is started after this time (ms)
 */

/**
 * @typedef {{ pulled: PulledFile, connectionLost?: boolean }} PullOutcome
 */

/**
 * Logs what happened to a file. An SFTP error that isn't about the file
 * itself (see isFileLevelError: no SFTP status code, or a timeout) means the
 * connection is lost, so the rest of the pull should stop.
 * @param {{ pulled: PulledFile, error?: Error, sftpError?: Error }} params
 * @returns {PullOutcome}
 */
const report = ({ pulled, error, sftpError }) => {
  const problem = error ?? sftpError
  if (problem) {
    logger.error(
      problem,
      `SSCL file ${pulled.filename} not received: ${pulled.status}`
    )
  } else if (pulled.status === 'received') {
    logger.info({ sscl: pulled }, 'SSCL file received')
  } else if (pulled.status === 'gone') {
    logger.info({ sscl: pulled }, 'SSCL file gone before it could be pulled')
  } else {
    logger.warn({ sscl: pulled }, `SSCL file not received: ${pulled.status}`)
  }
  return {
    pulled,
    connectionLost: Boolean(sftpError) && !isFileLevelError(sftpError)
  }
}

/**
 * Removes a stored file from the pull folder, unless it has changed since it
 * was listed (SSCL may have replaced it with a file we haven't read).
 * @param {PullContext & { file: SftpFile, pulled: PulledFile }} params
 * @returns {Promise<PullOutcome>}
 */
const removeIfUnchanged = async ({ session, file, pulled }) => {
  try {
    const current = await session.stat(file.name)
    if (
      current &&
      (current.size !== file.size || current.modifyTime !== file.modifyTime)
    ) {
      return report({ pulled: { ...pulled, status: 'changed' } })
    }
    await session.remove(file.name)
    return report({ pulled: { ...pulled, status: 'received' } })
  } catch (error) {
    return report({
      pulled: { ...pulled, status: 'not-deleted' },
      sftpError: error
    })
  }
}

/**
 * @param {{ filename: string, timeoutMs: number, store: () => Promise<void> }} params
 */
const withStoreTimeout = ({ filename, timeoutMs, store }) =>
  withTimeout({
    timeoutMs,
    work: store,
    makeError: () =>
      new Error(`Storing SSCL file ${filename} took over ${timeoutMs}ms`)
  })

/**
 * @param {PullContext & { file: SftpFile, pulled: PulledFile, encrypted: Buffer }} params
 * @returns {Promise<PullOutcome>}
 */
const verifyStoreAndRemove = async (params) => {
  const { keys, limits, onFile, file, encrypted } = params
  const pulled = {
    ...params.pulled,
    sha256: createHash('sha256').update(encrypted).digest('hex')
  }
  let data
  try {
    data = await decryptAndVerify({
      data: encrypted,
      decryptionKey: keys.nrfPrivateKey,
      passphrase: keys.nrfPassphrase,
      verificationKey: keys.ssclSigningPublicKey,
      maxDecompressedBytes: limits.maxFileBytes
    })
  } catch (error) {
    return report({ pulled: { ...pulled, status: 'unverified' }, error })
  }
  const stored = { ...pulled, decryptedSize: data.length }
  try {
    await withStoreTimeout({
      filename: file.name,
      timeoutMs: params.storeTimeoutMs,
      store: () => onFile({ filename: file.name, data, sha256: pulled.sha256 })
    })
  } catch (error) {
    return report({ pulled: { ...stored, status: 'not-stored' }, error })
  }
  return removeIfUnchanged({ ...params, pulled: stored })
}

/**
 * @param {PullContext & { file: SftpFile }} params
 * @returns {Promise<PullOutcome>}
 */
const pullOne = async (params) => {
  const { session, limits, file } = params
  const pulled = { filename: file.name, size: file.size }
  if (file.size > limits.maxFileBytes) {
    return report({ pulled: { ...pulled, status: 'too-large' } })
  }
  let encrypted
  try {
    encrypted = await session.download({
      filename: file.name,
      maxBytes: limits.maxFileBytes,
      size: file.size
    })
  } catch (error) {
    if (isNoSuchFileError(error)) {
      return report({ pulled: { ...pulled, status: 'gone' } })
    }
    // Listed within the limit, so it grew after it was listed.
    if (error?.code === ssclErrorCodes.fileTooLarge) {
      return report({ pulled: { ...pulled, status: 'changed' } })
    }
    return report({
      pulled: { ...pulled, status: 'download-failed' },
      sftpError: error
    })
  }
  if (encrypted.length !== file.size) {
    return report({ pulled: { ...pulled, status: 'changed' } })
  }
  return verifyStoreAndRemove({ ...params, pulled, encrypted })
}

/**
 * Leaves out files whose name ends in the partial upload suffix: a sender that
 * uploads under a temporary name is still writing them. Not counted as left
 * for a later pull. SSCL's own convention is not agreed, so a file it is still
 * writing under another name is handled by pullOne, which treats a file that
 * disappears or changes as not ready.
 * @param {SftpFile[]} listed
 */
const withoutUploadsInProgress = (listed) =>
  listed.filter((file) => !file.name.endsWith(partialSuffix))

/**
 * Identifies a file as listed, so a file that is replaced counts as new.
 * @param {SftpFile} file
 */
const listingKey = ({ name, size, modifyTime }) =>
  `${name}|${size}|${modifyTime}`

/**
 * Puts files that failed on an earlier pull after the others, so one bad file
 * cannot take every slot of every pull. Forgets files no longer listed.
 * @param {{ listed: SftpFile[], failing: Set<string> }} params
 */
const newFilesFirst = ({ listed, failing }) => {
  const keys = new Set(listed.map(listingKey))
  for (const key of failing) {
    if (!keys.has(key)) {
      failing.delete(key)
    }
  }
  return [
    ...listed.filter((file) => !failing.has(listingKey(file))),
    ...listed.filter((file) => failing.has(listingKey(file)))
  ]
}

/**
 * @param {{ files: PulledFile[], retried: number }} params
 */
const warnIfOnlyRetried = ({ files, retried }) => {
  if (files.length > 0 && retried === files.length) {
    logger.warn(
      { sscl: { retried } },
      'SSCL pull only retried files that failed before'
    )
  }
}

/**
 * @param {Omit<PullContext, 'session'> & { transport: SsclTransport, failing: Set<string> }} params
 *   failing holds the listing keys of files that failed on an earlier pull
 * @returns {Promise<PullResult>}
 */
const pullAll = ({ transport, failing, ...context }) =>
  transport.withPullSession(async function pullEach(session) {
    const listed = newFilesFirst({
      listed: withoutUploadsInProgress(await session.list()),
      failing
    })
    const files = []
    let retried = 0
    for (const file of listed.slice(0, context.limits.maxFilesPerRun)) {
      if (Date.now() >= context.stopAt) {
        break
      }
      const key = listingKey(file)
      if (failing.has(key)) {
        retried++
      }
      const { pulled, connectionLost } = await pullOne({
        ...context,
        session,
        file
      })
      files.push(pulled)
      if (completedPullStatuses.has(pulled.status)) {
        failing.delete(key)
      } else {
        failing.add(key)
      }
      if (connectionLost) {
        break
      }
    }
    warnIfOnlyRetried({ files, retried })
    return { files, notProcessed: listed.length - files.length }
  })

/**
 * @typedef {ReturnType<typeof createSsclClient>} SsclClient
 */

/**
 * Exchanges PGP encrypted and signed files with SSCL over a transport.
 * @param {{ transport: SsclTransport, keys: SsclPgpKeys, limits: SsclLimits }} params
 */
export function createSsclClient({ transport, keys, limits }) {
  let pulling = false
  /** Listing keys of files that failed on an earlier pull. Kept in memory. */
  const failing = new Set()

  return {
    /**
     * Encrypts, signs and pushes a file. Fails with ssclErrorCodes.fileExists
     * rather than overwrite a file of the same name, and with
     * ssclErrorCodes.emptyFile when there is nothing to send, and with
     * ssclErrorCodes.pushTooLarge when the encrypted file is over
     * maxFileBytes. fileExists
     * after a push that failed part way may mean that push got through: the
     * rename can succeed after the connection to us is lost.
     * @param {SsclFile} file
     */
    async pushFile({ filename, data }) {
      if (filename.endsWith(partialSuffix)) {
        throw ssclError({
          code: ssclErrorCodes.invalidFilename,
          message: `Refusing to push ${filename}: names ending ${partialSuffix} are for uploads in progress`
        })
      }
      // Agreed with SSCL (18 Nov 2026): send no file when there is no data.
      // An empty file would still be a valid PGP message, so SSCL's jobs would
      // pick it up. Callers should skip the push rather than rely on this.
      if (data.length === 0) {
        throw ssclError({
          code: ssclErrorCodes.emptyFile,
          message: `Refusing to push ${filename} with no data`
        })
      }
      const encrypted = await encryptAndSign({
        data,
        encryptionKey: keys.ssclEncryptionPublicKey,
        signingKey: keys.nrfPrivateKey,
        passphrase: keys.nrfPassphrase
      })
      if (encrypted.length > limits.maxFileBytes) {
        throw ssclError({
          code: ssclErrorCodes.pushTooLarge,
          message: `Refusing to push ${filename}: ${encrypted.length} bytes encrypted, over ${limits.maxFileBytes}`
        })
      }
      await transport.pushFile({ filename, data: encrypted })
      logger.info(
        { sscl: { filename, size: encrypted.length } },
        'SSCL file pushed'
      )
    },

    listPushFolder: () => transport.listPushFolder(),

    /**
     * Downloads, decrypts and verifies each file in the pull folder, hands it
     * to onFile, then removes it from the pull folder. A file is left in place
     * if any step fails, so a later pull can try again. One pull at a time per
     * backend instance. Starts no new file after stopAfterMs, if given; a
     * file already started can run past it. Files that failed before are
     * tried after the others. A file whose onFile has not settled within
     * storeTimeoutMs counts as not-stored.
     * @param {{ onFile: OnPulledFile, stopAfterMs?: number, storeTimeoutMs?: number }} params
     * @returns {Promise<PullResult>}
     */
    async pullFiles({
      onFile,
      stopAfterMs = Infinity,
      storeTimeoutMs = defaultStoreTimeoutMs
    }) {
      if (pulling) {
        throw ssclError({
          code: ssclErrorCodes.pullInProgress,
          message: 'An SSCL pull is already in progress'
        })
      }
      pulling = true
      try {
        return await pullAll({
          transport,
          failing,
          keys,
          limits,
          onFile,
          storeTimeoutMs,
          stopAt: Date.now() + stopAfterMs
        })
      } finally {
        pulling = false
      }
    }
  }
}
