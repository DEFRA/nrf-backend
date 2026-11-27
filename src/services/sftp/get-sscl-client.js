import ssh2 from 'ssh2'

import { config } from '../../config.js'
import { createHostVerifier } from '../../common/helpers/sscl/host-key.js'
import {
  assertPgpPrivateKeyUnlocks,
  pgpKeyDetails
} from '../../common/helpers/sscl/pgp.js'
import { assertSsclTestRouteAllowed } from '../../common/helpers/sscl/sscl-guards.js'
import { createSftpTransport } from './sftp-transport.js'
import { createSsclClient } from './sscl-client.js'

const configKeys = {
  hostKey: 'sscl.sftp.hostKey',
  sshPrivateKey: 'sscl.sftp.privateKey',
  nrfPrivateKey: 'sscl.pgp.nrfPrivateKey',
  ssclEncryptionKey: 'sscl.pgp.ssclEncryptionPublicKey',
  ssclSigningKey: 'sscl.pgp.ssclSigningPublicKey',
  nrfPassphrase: 'sscl.pgp.nrfPassphrase',
  testEnabled: 'sscl.testEnabled'
}

/**
 * @typedef {import('./sscl-client.js').SsclClient} SsclClient
 * @typedef {import('./sscl-client.js').SsclPgpKeys} SsclPgpKeys
 * @typedef {import('./sftp-transport.js').SftpTransportSettings} SftpTransportSettings
 * @typedef {{ transport: SftpTransportSettings, keys: SsclPgpKeys }} MoveitSettings
 */

let clientPromise

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/
const base64GroupLength = 4

const required = (key) => {
  const value = config.get(key)
  if (!value) {
    throw new Error(`${key} is not set`)
  }
  return value
}

/**
 * @param {{ key: string, value: string }} params
 */
const decodeBase64 = ({ key, value }) => {
  // Base64 copied from a file is often wrapped over several lines
  const unwrapped = value.replaceAll(/\s/g, '')
  // A whole number of 4-character groups, so a value cut short by a bad copy
  // and paste is reported here rather than as an unreadable key
  if (
    !base64Pattern.test(unwrapped) ||
    unwrapped.length % base64GroupLength !== 0
  ) {
    throw new Error(`${key} is not valid base64`)
  }
  return Buffer.from(unwrapped, 'base64').toString('utf8')
}

const requiredBase64 = (key) => decodeBase64({ key, value: required(key) })

const ssclLimits = () => ({
  maxFileBytes: config.get('sscl.maxFileBytes'),
  maxFilesPerRun: config.get('sscl.maxFilesPerRun')
})

const assertTestRouteAllowed = () =>
  assertSsclTestRouteAllowed({
    testEnabled: config.get(configKeys.testEnabled),
    environment: config.get('cdpEnvironment')
  })

/**
 * The MOVEit connection settings and PGP keys from config. Throws naming the
 * first one that is missing or not base64.
 * @returns {MoveitSettings}
 */
const readMoveitSettings = () => ({
  transport: {
    connection: {
      host: required('sscl.sftp.host'),
      port: config.get('sscl.sftp.port'),
      hostKey: requiredBase64(configKeys.hostKey),
      privateKey: requiredBase64(configKeys.sshPrivateKey),
      timeoutMs: config.get('sscl.sftp.timeoutMs'),
      proxyUrl: config.get('httpProxy') ?? undefined
    },
    pushUser: required('sscl.sftp.pushUser'),
    pushFolder: required('sscl.sftp.pushFolder'),
    pullUser: required('sscl.sftp.pullUser'),
    pullFolder: required('sscl.sftp.pullFolder')
  },
  keys: {
    nrfPrivateKey: requiredBase64(configKeys.nrfPrivateKey),
    nrfPassphrase: config.get(configKeys.nrfPassphrase),
    ssclEncryptionPublicKey: requiredBase64(configKeys.ssclEncryptionKey),
    ssclSigningPublicKey: requiredBase64(configKeys.ssclSigningKey)
  }
})

/**
 * Runs a parse of one config value, throwing an error that names the config
 * key but never the value or the parser's message, which could quote it.
 * @template T
 * @param {{ key: string, what: string, parse: () => T | Promise<T> }} params
 * @returns {Promise<T>}
 */
const parseConfigValue = async ({ key, what, parse }) => {
  try {
    const result = await parse()
    if (result instanceof Error) {
      throw result
    }
    return result
  } catch {
    throw new Error(`${key} is not a valid ${what}`)
  }
}

/**
 * Reads an SSH private key, refusing a public key, which ssh2 also reads.
 * @param {string} privateKey
 */
const readSshPrivateKey = (privateKey) => {
  const key = ssh2.utils.parseKey(privateKey)
  if (key instanceof Error || !key.isPrivateKey()) {
    throw new Error('not an SSH private key')
  }
  return key
}

/**
 * The fingerprint of a PGP key from config, refusing a public key where a
 * private key belongs and a private key where a public key belongs.
 * @param {{ key: string, armoredKey: string, isPrivate: boolean }} params
 */
const readPgpKeyFingerprint = ({ key, armoredKey, isPrivate }) =>
  parseConfigValue({
    key,
    what: isPrivate ? 'PGP private key' : 'PGP public key',
    parse: async function readFingerprint() {
      const details = await pgpKeyDetails(armoredKey)
      if (details.isPrivate !== isPrivate) {
        throw new Error('wrong kind of PGP key')
      }
      return details.fingerprint
    }
  })

/**
 * Checks each PGP key in config is the kind it should be, in config order,
 * and catches SSCL's key config being set to NRF's own key by mistake, which
 * would let NRF's key stand in for SSCL's signature. Compares primary key
 * fingerprints only: a subkey shared between keys is not looked for.
 * @param {SsclPgpKeys} keys
 */
const assertPgpKeysUsable = async (keys) => {
  const nrf = await readPgpKeyFingerprint({
    key: configKeys.nrfPrivateKey,
    armoredKey: keys.nrfPrivateKey,
    isPrivate: true
  })
  const encryption = await readPgpKeyFingerprint({
    key: configKeys.ssclEncryptionKey,
    armoredKey: keys.ssclEncryptionPublicKey,
    isPrivate: false
  })
  const signing = await readPgpKeyFingerprint({
    key: configKeys.ssclSigningKey,
    armoredKey: keys.ssclSigningPublicKey,
    isPrivate: false
  })
  if (nrf === encryption || nrf === signing) {
    throw new Error("SSCL's PGP public keys must not be NRF's own key")
  }
}

/**
 * Checks that the keys in the MOVEit settings can be read, so a bad deploy
 * fails at startup rather than at the first exchange.
 * @param {MoveitSettings} settings
 */
const assertMoveitKeysUsable = async ({ transport, keys }) => {
  await parseConfigValue({
    key: configKeys.hostKey,
    what: 'SFTP host key',
    parse: () => createHostVerifier(transport.connection.hostKey)
  })
  await parseConfigValue({
    key: configKeys.sshPrivateKey,
    what: 'SSH private key',
    parse: () => readSshPrivateKey(transport.connection.privateKey)
  })
  await assertPgpKeysUsable(keys)
  await parseConfigValue({
    key: configKeys.nrfPassphrase,
    what: `passphrase for ${configKeys.nrfPrivateKey}`,
    parse: () =>
      assertPgpPrivateKeyUnlocks({
        privateKey: keys.nrfPrivateKey,
        passphrase: keys.nrfPassphrase
      })
  })
}

const buildMoveitClient = async () => {
  const settings = readMoveitSettings()
  await assertMoveitKeysUsable(settings)
  return createSsclClient({
    transport: createSftpTransport(settings.transport),
    keys: settings.keys,
    limits: ssclLimits()
  })
}

/**
 * Checks the SSCL config at startup, so a bad deploy fails then rather than
 * at the first exchange. The MOVEit settings are required only when the test
 * route is on. The prod check relies on ENVIRONMENT being set; test and prod
 * MOVEit share a host name, so the host cannot be a second check.
 */
export async function assertSsclConfig() {
  assertTestRouteAllowed()
  if (config.get(configKeys.testEnabled)) {
    await assertMoveitKeysUsable(readMoveitSettings())
  }
}

const buildCheckedMoveitClient = async () => {
  assertTestRouteAllowed()
  return buildMoveitClient()
}

/**
 * Forgets a failed build, so the next call tries again, unless a reset has
 * already replaced it.
 * @param {Promise<SsclClient>} building
 */
const forgetIfFailed = (building) =>
  building.catch(function forgetFailedBuild() {
    if (clientPromise === building) {
      clientPromise = undefined
    }
  })

/**
 * The SSCL client for this environment, talking to MOVEit over SFTP. Built
 * once per backend instance.
 * @returns {Promise<SsclClient>}
 */
export function getSsclClient() {
  if (!clientPromise) {
    clientPromise = buildCheckedMoveitClient()
    forgetIfFailed(clientPromise)
  }
  return clientPromise
}

export function resetSsclClient() {
  clientPromise = undefined
}
