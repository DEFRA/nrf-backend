import { config } from '../config.js'
import { withSftpSession } from '../services/sftp/sftp-client.js'
import { readSftpTestKey, sftpTestKeyFiles } from './sftp-test-keys.js'
import { pgpConfigFor, toBase64 } from './sscl-test-helpers.js'

/**
 * @typedef {import('../services/sftp/sftp-client.js').SftpConnectionSettings} SftpConnectionSettings
 * @typedef {import('../services/sftp/sftp-client.js').SftpSession} SftpSession
 * @typedef {{ push: string, pull: string }} SftpTestFolders
 * @typedef {'push' | 'pull'} SftpTestDirection
 * @typedef {Partial<Pick<SftpConnectionSettings, 'hostKey' | 'proxyUrl'>>} SftpTestOverrides
 * @typedef {{ direction: SftpTestDirection, folders?: SftpTestFolders }} SftpTestFolderParams
 */

export const sftpTestFolders = {
  push: '/Interfaces/DEF/Test/NRLIn',
  pull: '/Interfaces/DEF/Test/NRLOut'
}

/** @type {{ push: 'push', pull: 'pull' }} */
export const sftpTestDirections = { push: 'push', pull: 'pull' }

/**
 * Time limit for test hooks that connect to the SFTP container: the first SSH
 * handshake can take over vitest's 10 second default while every test file
 * runs at once against the one container.
 */
export const sftpTestHookTimeoutMs = 30000

/**
 * Time limit for each test against the SFTP container: a test makes several
 * SSH connections, each of which can be slow while other files use the
 * container.
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
 * earlier runs don't build up.
 * @param {{ folders?: SftpTestFolders }} [params]
 */
export const clearSftpTestFolders = async ({
  folders = sftpTestFolders
} = {}) => {
  for (const direction of Object.values(sftpTestDirections)) {
    const folder = folders[direction]
    await asSftpTestUser({
      direction,
      work: async (session) => {
        for (const file of await session.list(folder)) {
          await session.remove({ folder, filename: file.name })
        }
      }
    })
  }
}

/**
 * @param {SftpTestFolderParams & { filename: string, data: Buffer }} params
 */
export const putInSftpTestFolder = ({
  direction,
  filename,
  data,
  folders = sftpTestFolders
}) =>
  asSftpTestUser({
    direction,
    work: (session) =>
      session.upload({ folder: folders[direction], filename, data })
  })

/**
 * @param {SftpTestFolderParams & { filename: string, maxBytes: number }} params
 * @returns {Promise<Buffer>}
 */
export const getFromSftpTestFolder = ({
  direction,
  filename,
  maxBytes,
  folders = sftpTestFolders
}) =>
  asSftpTestUser({
    direction,
    work: (session) =>
      session.download({ folder: folders[direction], filename, maxBytes })
  })

/**
 * @param {SftpTestFolderParams} params
 */
export const namesInSftpTestFolder = async ({
  direction,
  folders = sftpTestFolders
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
 * @param {{ keys: import('./pgp-test-keys.js').PgpTestKeys, folders?: SftpTestFolders }} params
 */
export const loadSftpTestServerConfig = ({
  keys,
  folders = sftpTestFolders
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
