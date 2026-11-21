import { readFileSync } from 'node:fs'
import path from 'node:path'
import SftpClient from 'ssh2-sftp-client'

import { config } from '../config.js'
import { withSftpSession } from '../services/sftp/sftp-client.js'
import { toBase64 } from './sscl-test-helpers.js'

const keysDir = path.resolve('.sftp-test-keys')
const readKey = (name) => readFileSync(path.join(keysDir, name), 'utf8').trim()

export const sftpTestFolders = {
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

/** Separate folders for the fake SSCL service tests. */
export const sftpFakeSsclTestFolders = {
  push: '/Interfaces/DEF/FakeSsclTest/NRLIn',
  pull: '/Interfaces/DEF/FakeSsclTest/NRLOut'
}

/**
 * @typedef {{ push: string, pull: string }} SftpTestFolders
 */

/**
 * Time limit for test hooks that connect to the SFTP container: the first SSH
 * handshake can take over vitest's 10 second default while every test file
 * runs at once against the one container.
 */
export const sftpTestHookTimeoutMs = 30000

export const sftpTestUsers = {
  push: 'CDDEFTNRLIn',
  pull: 'CDDEFTNRLOut'
}

/**
 * Connection settings for the atmoz/sftp container in compose.test.yml, using
 * the throwaway keys written by the vitest global setup.
 * @param {{ username: string, hostKey?: string, proxyUrl?: string }} overrides
 */
export const sftpTestSettings = ({ username, hostKey, proxyUrl }) => ({
  host: '127.0.0.1',
  port: 2223,
  username,
  privateKey: readKey('client'),
  hostKey: hostKey ?? readKey('ssh_host_ed25519_key.pub'),
  timeoutMs: 10000,
  proxyUrl
})

/**
 * Connection settings for the local SFTP server without a username, for code
 * that logs in as both the push and pull users.
 */
export const sftpTestConnection = () => {
  const { username: _username, ...connection } = sftpTestSettings({
    username: ''
  })
  return connection
}

/**
 * Empties the push and pull folders on the local SFTP server, so files left by
 * earlier runs don't build up.
 * @param {{ folders?: SftpTestFolders }} [params]
 */
export const clearSftpTestFolders = async ({
  folders = sftpTestFolders
} = {}) => {
  for (const direction of ['push', 'pull']) {
    const settings = sftpTestSettings({ username: sftpTestUsers[direction] })
    const client = new SftpClient()
    await client.connect(settings)
    try {
      const folder = folders[direction]
      const entries = await client.list(folder)
      for (const { name } of entries) {
        await client.delete(`${folder}/${name}`)
      }
    } finally {
      await client.end()
    }
  }
}

/**
 * Runs work in an SFTP session as the push or pull user.
 * @template T
 * @param {{ direction: 'push' | 'pull', work: (session: import('../services/sftp/sftp-client.js').SftpSession) => Promise<T>, hostKey?: string, proxyUrl?: string }} params
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
 * @param {{ direction: 'push' | 'pull', filename: string, data: Buffer, folders?: SftpTestFolders }} params
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
 * @param {{ direction: 'push' | 'pull', folders?: SftpTestFolders }} params
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
 * @param {{ keys: Awaited<ReturnType<typeof import('./pgp-test-keys.js').generatePgpTestKeys>>, folders?: SftpTestFolders }} params
 */
export const loadSftpTestServerConfig = ({
  keys,
  folders = sftpTestFolders
}) => {
  const { host, port, privateKey, hostKey } = sftpTestSettings({ username: '' })
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
      pgp: {
        nrfPrivateKey: toBase64(keys.nrf.privateKey),
        nrfPassphrase: keys.nrf.passphrase,
        ssclEncryptionPublicKey: toBase64(keys.ssclEncryption.publicKey),
        ssclSigningPublicKey: toBase64(keys.ssclSigning.publicKey)
      }
    }
  })
}
