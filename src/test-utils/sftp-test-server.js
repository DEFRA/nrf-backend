import SftpClient from 'ssh2-sftp-client'

import { config } from '../config.js'
import { createHostVerifier } from '../common/helpers/sscl/host-key.js'
import { resetSsclClient } from '../services/sftp/get-sscl-client.js'
import { withSftpSession } from '../services/sftp/sftp-client.js'
import { readSftpTestKey, sftpTestKeyFiles } from './sftp-test-keys.js'
import { pgpConfigFor, toBase64 } from './sscl-test-helpers.js'

/**
 * @typedef {import('../services/sftp/sftp-client.js').SftpConnectionSettings} SftpConnectionSettings
 * @typedef {import('../services/sftp/sftp-client.js').SftpSession} SftpSession
 * @typedef {import('./pgp-test-keys.js').PgpTestKeys} PgpTestKeys
 * @typedef {{ push: string, pull: string }} SftpContainerFolders
 * @typedef {'push' | 'pull'} SftpTestDirection
 * @typedef {Partial<Pick<SftpConnectionSettings, 'hostKey' | 'proxyUrl'>>} SftpTestOverrides
 * @typedef {{ folders?: SftpContainerFolders }} SftpContainerFoldersParam
 * @typedef {{ direction: SftpTestDirection } & SftpContainerFoldersParam} SftpContainerFolderParams
 */

export const sftpContainerFolders = {
  push: '/Interfaces/DEF/Test/NRLIn',
  pull: '/Interfaces/DEF/Test/NRLOut'
}

/**
 * Separate folders for the route tests, which run alongside the SFTP
 * integration tests.
 */
export const sftpRouteTestFolders = {
  push: '/Interfaces/DEF/RouteTest/NRLIn',
  pull: '/Interfaces/DEF/RouteTest/NRLOut'
}

/** @type {{ push: 'push', pull: 'pull' }} */
export const sftpTestDirections = { push: 'push', pull: 'pull' }

/**
 * Time limit for test hooks that connect to the SFTP container: the first SSH
 * handshake can take over vitest's 10 second default while other test files
 * compete for the CPU, more so where the amd64-only image is emulated.
 */
export const sftpTestHookTimeoutMs = 30000

/**
 * Time limit for each test against the SFTP container: a test makes several
 * SSH connections, each of which can be slow for the same reason.
 */
export const sftpTestTimeoutMs = 20000

export const sftpTestUsers = {
  push: 'CDDEFTNRLIn',
  pull: 'CDDEFTNRLOut'
}

/**
 * Connection settings for the local atmoz/sftp test container without a
 * username, for code that logs in as both the push and pull users. Uses the
 * throwaway keys written by the vitest global setup.
 * @param {SftpTestOverrides} [overrides]
 */
export const sftpTestConnection = ({ hostKey, proxyUrl } = {}) => ({
  host: '127.0.0.1',
  port: 2223,
  privateKey: readSftpTestKey({ keyFileName: sftpTestKeyFiles.clientPrivate }),
  hostKey:
    hostKey ?? readSftpTestKey({ keyFileName: sftpTestKeyFiles.hostPublic }),
  timeoutMs: 10000,
  proxyUrl
})

/**
 * Connection settings for the local SFTP test container, logging in as one
 * user.
 * @param {{ username: string } & SftpTestOverrides} params
 */
export const sftpTestSettings = ({ username, ...overrides }) => ({
  ...sftpTestConnection(overrides),
  username
})

/**
 * Runs work in an SFTP session as the push or pull user.
 * @template T
 * @param {{ direction: SftpTestDirection, work: (session: SftpSession) => Promise<T> } & SftpTestOverrides} params
 * @returns {Promise<T>}
 */
export const asSftpTestUser = ({ direction, work, ...overrides }) =>
  withSftpSession({
    settings: sftpTestSettings({
      username: sftpTestUsers[direction],
      ...overrides
    }),
    work
  })

/**
 * Empties the push and pull folders on the local SFTP server, so files left by
 * earlier runs don't build up. Uses the plain SFTP library rather than an SFTP
 * session, which refuses unsafe names such as the fake SSCL's reply with
 * spaces in its name.
 * @param {SftpContainerFoldersParam} [params]
 */
export const clearSftpTestFolders = async ({
  folders = sftpContainerFolders
} = {}) => {
  const { host, port, privateKey, hostKey, timeoutMs } = sftpTestConnection()
  for (const direction of Object.values(sftpTestDirections)) {
    const client = new SftpClient()
    // The library closes a connection that fails to open, so only an open
    // one needs ending
    await client.connect({
      host,
      port,
      username: sftpTestUsers[direction],
      privateKey,
      hostVerifier: createHostVerifier(hostKey),
      readyTimeout: timeoutMs
    })
    try {
      const folder = folders[direction]
      const files = (await client.list(folder)).filter(
        (entry) => entry.type === '-'
      )
      for (const file of files) {
        await client.delete(`${folder}/${file.name}`)
      }
    } finally {
      await client.end()
    }
  }
}

/**
 * @param {SftpContainerFolderParams & { filename: string, data: Buffer }} params
 */
export const putInSftpTestFolder = ({
  direction,
  filename,
  data,
  folders = sftpContainerFolders
}) =>
  asSftpTestUser({
    direction,
    work: (session) =>
      session.upload({ folder: folders[direction], filename, data })
  })

/**
 * @param {SftpContainerFolderParams & { filename: string, maxBytes: number }} params
 * @returns {Promise<Buffer>}
 */
export const getFromSftpTestFolder = ({
  direction,
  filename,
  maxBytes,
  folders = sftpContainerFolders
}) =>
  asSftpTestUser({
    direction,
    work: (session) =>
      session.download({ folder: folders[direction], filename, maxBytes })
  })

/**
 * @param {SftpContainerFolderParams} params
 */
export const namesInSftpTestFolder = async ({
  direction,
  folders = sftpContainerFolders
}) =>
  (
    await asSftpTestUser({
      direction,
      work: (session) => session.list(folders[direction])
    })
  ).map((file) => file.name)

/**
 * Loads SSCL config pointing at the local SFTP server, with the given PGP test
 * keys, as the backend would read it from the environment.
 * @param {{ keys: PgpTestKeys } & SftpContainerFoldersParam} params
 */
export const loadSftpTestServerConfig = ({
  keys,
  folders = sftpContainerFolders
}) => {
  const { host, port, privateKey, hostKey } = sftpTestConnection()
  config.load({
    sscl: {
      sftp: {
        host,
        port,
        hostKey: toBase64(hostKey),
        privateKey: toBase64(privateKey),
        pushUser: sftpTestUsers.push,
        pushFolder: folders.push,
        pullUser: sftpTestUsers.pull,
        pullFolder: folders.pull
      },
      pgp: pgpConfigFor(keys)
    }
  })
}

/**
 * Time limit for each route test: a request opens a push and a pull session,
 * which is slow where the SFTP image runs emulated.
 */
export const sftpRouteTestTimeoutMs = 30000

/**
 * A request to the SSCL test route, for `server.inject`.
 * @param {object} [options] - other inject options, such as headers or payload
 */
export const sftpTestFileRequest = (options) => ({
  method: 'POST',
  url: '/sftp/test-file',
  ...options
})

/**
 * Points the MOVEit settings at the SFTP container with the test route on,
 * and drops any SSCL client built from earlier settings.
 * @param {{ keys: PgpTestKeys } & SftpContainerFoldersParam} params
 */
export const loadSftpRouteTestConfig = ({ keys, folders }) => {
  loadSftpTestServerConfig({ keys, folders })
  config.set('sscl.testEnabled', true)
  resetSsclClient()
}
