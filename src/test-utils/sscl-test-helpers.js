import { randomUUID } from 'node:crypto'

import { config } from '../config.js'
import { generateSshTestKeyPair } from './ssh-test-keys.js'

/**
 * @typedef {import('../services/sftp/sftp-transport.js').SsclTransport} SsclTransport
 * @typedef {import('../services/sftp/sftp-transport.js').PullSession} PullSession
 * @typedef {import('../services/sftp/sscl-client.js').PullResult} PullResult
 * @typedef {import('../services/sftp/sscl-client.js').SsclPgpKeys} SsclPgpKeys
 * @typedef {import('./pgp-test-keys.js').PgpTestKeys} PgpTestKeys
 * @typedef {Awaited<ReturnType<typeof import('./sftp-fault-server.js').startSftpFaultServer>>} SftpFaultServer
 * @typedef {import('./sftp-fault-server.js').SftpOperation} SftpOperation
 */

export const ssclTestLimits = { maxFileBytes: 1024 * 1024, maxFilesPerRun: 50 }

/**
 * The keys the SSCL client holds, from the PGP test keys.
 * @param {PgpTestKeys} pgp
 * @returns {SsclPgpKeys}
 */
export const nrfPgpKeysFor = (pgp) => ({
  nrfPrivateKey: pgp.nrf.privateKey,
  nrfPassphrase: pgp.nrf.passphrase,
  ssclEncryptionPublicKey: pgp.ssclEncryption.publicKey,
  ssclSigningPublicKey: pgp.ssclSigning.publicKey
})

/**
 * @param {string} text
 */
export const toBase64 = (text) => Buffer.from(text).toString('base64')

/**
 * @param {string} base64
 */
export const fromBase64 = (base64) => Buffer.from(base64, 'base64').toString()

/** Push and pull folders in the MOVEit test config. */
export const moveitTestFolders = { push: '/out', pull: '/in' }

/** Push and pull users in the MOVEit test config. */
export const moveitTestUsers = { push: 'push-user', pull: 'pull-user' }

const anyBase64 = 'aA=='
let sshKeys

/** One SSH key pair for every MOVEit test config, made when first needed. */
const moveitSshKeys = () => {
  sshKeys ??= generateSshTestKeyPair()
  return sshKeys
}

/**
 * Loads config for MOVEit with every required setting present: real SSH keys,
 * placeholder PGP keys unless given (the client checks PGP keys when built).
 * @param {{ pgp?: Partial<SsclPgpKeys> }} [overrides] - PGP keys in base64, as config holds them
 */
export const loadMoveitTestConfig = ({ pgp } = {}) =>
  config.load({
    sscl: {
      sftp: {
        host: 'h',
        hostKey: toBase64(moveitSshKeys().public),
        privateKey: toBase64(moveitSshKeys().private),
        pushUser: moveitTestUsers.push,
        pushFolder: moveitTestFolders.push,
        pullUser: moveitTestUsers.pull,
        pullFolder: moveitTestFolders.pull
      },
      pgp: {
        nrfPrivateKey: anyBase64,
        ssclEncryptionPublicKey: anyBase64,
        ssclSigningPublicKey: anyBase64,
        ...pgp
      }
    }
  })

/**
 * The PGP test keys as SSCL config holds them: keys in base64.
 * @param {PgpTestKeys} keys
 */
export const pgpConfigFor = (keys) => ({
  nrfPrivateKey: toBase64(keys.nrf.privateKey),
  nrfPassphrase: keys.nrf.passphrase,
  ssclEncryptionPublicKey: toBase64(keys.ssclEncryption.publicKey),
  ssclSigningPublicKey: toBase64(keys.ssclSigning.publicKey)
})

/**
 * Loads config for MOVEit with every key real and usable.
 * @param {{ keys: PgpTestKeys }} params
 */
export const loadUsableMoveitTestConfig = ({ keys }) =>
  loadMoveitTestConfig({ pgp: pgpConfigFor(keys) })

/**
 * Loads config for MOVEit with every key real and usable, pointing at an
 * in-process SFTP fault server.
 * @param {{ server: Pick<SftpFaultServer, 'settings'>, keys: PgpTestKeys, timeoutMs?: number }} params
 * @returns {{ host: string, port: number }} where the server listens
 */
export const loadFaultServerMoveitTestConfig = ({
  server,
  keys,
  timeoutMs
}) => {
  const { host, port, hostKey, privateKey } = server.settings()
  loadUsableMoveitTestConfig({ keys })
  config.load({
    sscl: {
      sftp: {
        host,
        port,
        hostKey: toBase64(hostKey),
        privateKey: toBase64(privateKey),
        ...(timeoutMs && { timeoutMs })
      }
    }
  })
  return { host, port }
}

/**
 * Wraps base64 over several lines, as it is in many key files.
 * @param {{ base64: string, width?: number }} params
 * @returns {string[]}
 */
export const wrapBase64 = ({ base64, width = 64 }) =>
  base64.match(new RegExp(`.{1,${width}}`, 'g'))

/**
 * An error carrying a code, as SFTP and socket errors do.
 * @param {number | string} code
 */
export const withCode = (code) =>
  Object.assign(new Error(`code ${code}`), { code })

/**
 * Each pulled file's name and status, in order.
 * @param {Pick<PullResult, 'files'>} pulled
 */
export const pulledStatuses = ({ files }) =>
  files.map(({ filename, status }) => [filename, status])

/**
 * The names of the files in a transport's pull folder.
 * @param {SsclTransport} transport
 */
export const pullFolderNames = async (transport) =>
  (await transport.withPullSession((session) => session.list())).map(
    (file) => file.name
  )

/**
 * Replaces some of a transport's pull session operations, e.g. to make a
 * download fail. The overrides can be built from the real session.
 * @param {{ transport: SsclTransport, overrides: Partial<PullSession> | ((session: PullSession) => Partial<PullSession>) }} params
 * @returns {() => void} puts the pull session back as it was before
 */
export const overridePullSession = ({ transport, overrides }) => {
  const original = transport.withPullSession
  const overridesFor = (session) =>
    typeof overrides === 'function' ? overrides(session) : overrides
  transport.withPullSession = function withOverriddenPullSession(work) {
    return original((session) => work({ ...session, ...overridesFor(session) }))
  }
  return function restorePullSession() {
    transport.withPullSession = original
  }
}

/**
 * Does something to each file just before a pull downloads it, e.g. removes
 * it, as if someone else got there first.
 * @param {{ transport: SsclTransport, beforeDownload: (params: { session: PullSession, filename: string }) => Promise<void> }} params
 * @returns {() => void} puts the pull session back as it was before
 */
export const runBeforeEachDownload = ({ transport, beforeDownload }) =>
  overridePullSession({
    transport,
    overrides: (session) => ({
      /** @param {Parameters<PullSession['download']>[0]} file */
      async download(file) {
        await beforeDownload({ session, filename: file.filename })
        return session.download(file)
      }
    })
  })

/**
 * A file name no other test uses, so a test on a shared SFTP server can tell
 * its own files from those left by other tests or earlier runs.
 * @param {string} prefix
 */
export const uniqueTestFilename = (prefix) => `${prefix}_${randomUUID()}.pgp`

/**
 * Makes a fault server answer one operation on one file with an SFTP status
 * code, and every other request as normal.
 * @param {{ server: Pick<SftpFaultServer, 'setFault'>, operation: SftpOperation, filename: string, status: number }} params
 */
export const refuseOn = ({ server, operation, filename, status }) =>
  server.setFault((request) =>
    request.operation === operation && request.path.endsWith(`/${filename}`)
      ? { status }
      : undefined
  )

/**
 * An onFile handler that keeps what it is given.
 */
export const collectPulledFiles = () => {
  const stored = []
  return {
    stored,
    onFile: async (file) => {
      stored.push(file)
    }
  }
}
