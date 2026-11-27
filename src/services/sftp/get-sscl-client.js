import ssh2 from 'ssh2'

import { config } from '../../config.js'
import { createHostVerifier } from '../../common/helpers/sscl/host-key.js'
import {
  assertPgpPrivateKeyUnlocks,
  pgpKeyFingerprint
} from '../../common/helpers/sscl/pgp.js'
import { assertSsclTestRouteAllowed } from '../../common/helpers/sscl/sscl-guards.js'
import { createSftpTransport } from './sftp-transport.js'
import { createSsclClient } from './sscl-client.js'

const nrfPrivateKeyName = 'sscl.pgp.nrfPrivateKey'

/**
 * @typedef {import('./sscl-client.js').SsclClient} SsclClient
 * @typedef {import('./sscl-client.js').SsclPgpKeys} SsclPgpKeys
 * @typedef {import('./sftp-transport.js').SftpTransportSettings} SftpTransportSettings
 * @typedef {{ transport: SftpTransportSettings, keys: SsclPgpKeys }} MoveitSettings
 */

let clientPromise

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/

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
  if (!base64Pattern.test(unwrapped) || unwrapped.length % 4 !== 0) {
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
    testEnabled: config.get('sscl.testEnabled'),
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
      hostKey: requiredBase64('sscl.sftp.hostKey'),
      privateKey: requiredBase64('sscl.sftp.privateKey'),
      timeoutMs: config.get('sscl.sftp.timeoutMs'),
      proxyUrl: config.get('httpProxy') ?? undefined
    },
    pushUser: required('sscl.sftp.pushUser'),
    pushFolder: required('sscl.sftp.pushFolder'),
    pullUser: required('sscl.sftp.pullUser'),
    pullFolder: required('sscl.sftp.pullFolder')
  },
  keys: {
    nrfPrivateKey: requiredBase64(nrfPrivateKeyName),
    nrfPassphrase: config.get('sscl.pgp.nrfPassphrase'),
    ssclEncryptionPublicKey: requiredBase64('sscl.pgp.ssclEncryptionPublicKey'),
    ssclSigningPublicKey: requiredBase64('sscl.pgp.ssclSigningPublicKey')
  }
})

/**
 * Runs a parse of one config value, throwing an error that names the config
 * key but never the value or the parser's message, which could quote it.
 * @template T
 * @param {{ key: string, what: string, parse: () => T | Promise<T> }} params
 * @returns {Promise<T>}
 */
const parsed = async ({ key, what, parse }) => {
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
 * Catches SSCL's key config being set to NRF's own key by mistake, which would
 * let NRF's key stand in for SSCL's signature. Compares primary key
 * fingerprints only: a subkey shared between keys is not looked for.
 * @param {import('./sscl-client.js').SsclPgpKeys} keys
 */
const assertSsclKeysAreNotNrfs = async (keys) => {
  /** @param {{ key: string, armoredKey: string }} params */
  const fingerprint = ({ key, armoredKey }) =>
    parsed({
      key,
      what: 'PGP key',
      parse: () => pgpKeyFingerprint(armoredKey)
    })
  const [nrf, encryption, signing] = await Promise.all([
    fingerprint({ key: nrfPrivateKeyName, armoredKey: keys.nrfPrivateKey }),
    fingerprint({
      key: 'sscl.pgp.ssclEncryptionPublicKey',
      armoredKey: keys.ssclEncryptionPublicKey
    }),
    fingerprint({
      key: 'sscl.pgp.ssclSigningPublicKey',
      armoredKey: keys.ssclSigningPublicKey
    })
  ])
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
  await parsed({
    key: 'sscl.sftp.hostKey',
    what: 'SFTP host key',
    parse: () => createHostVerifier(transport.connection.hostKey)
  })
  await parsed({
    key: 'sscl.sftp.privateKey',
    what: 'SSH private key',
    parse: () => ssh2.utils.parseKey(transport.connection.privateKey)
  })
  await assertSsclKeysAreNotNrfs(keys)
  await parsed({
    key: 'sscl.pgp.nrfPassphrase',
    what: `passphrase for ${nrfPrivateKeyName}`,
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
  if (config.get('sscl.testEnabled')) {
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
