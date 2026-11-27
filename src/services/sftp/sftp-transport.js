import { withSftpSession } from './sftp-client.js'

/**
 * @typedef {import('./sftp-client.js').SftpFile} SftpFile
 * @typedef {import('./sftp-client.js').SftpConnectionSettings} SftpConnectionSettings
 */

/**
 * A file's name and content.
 * @typedef {{ filename: string, data: Buffer }} SsclFile
 */

/**
 * File operations on the pull folder, all over one connection.
 * @typedef {object} PullSession
 * @property {() => Promise<SftpFile[]>} list - by name
 * @property {(filename: string) => Promise<SftpFile | undefined>} stat
 * @property {(file: { filename: string, maxBytes: number, size?: number }) => Promise<Buffer>} download
 *   - size is the listed size, which sets the time limit
 * @property {(filename: string) => Promise<void>} remove - succeeds if already gone
 */

/**
 * Moves files to and from SSCL: we push to their NRLIn folder and pull from
 * their NRLOut folder. Implemented by the MOVEit SFTP transport, and in tests
 * by an in-memory transport.
 * @typedef {object} SsclTransport
 * @property {(file: SsclFile) => Promise<void>} pushFile
 *   - fails with ssclErrorCodes.fileExists rather than overwrite a file
 * @property {() => Promise<SftpFile[]>} listPushFolder
 * @property {<T>(work: (session: PullSession) => Promise<T>) => Promise<T>} withPullSession
 */

/**
 * @typedef {object} SftpTransportSettings
 * @property {Omit<SftpConnectionSettings, 'username'>} connection
 * @property {string} pushUser
 * @property {string} pushFolder
 * @property {string} pullUser
 * @property {string} pullFolder
 */

/**
 * SSCL transport over SFTP to MOVEit: logs in as the push user to write to the
 * push folder and as the pull user to read the pull folder.
 * @param {SftpTransportSettings} settings
 * @returns {SsclTransport}
 */
export function createSftpTransport(settings) {
  const { connection, pushUser, pushFolder, pullUser, pullFolder } = settings
  const push = { ...connection, username: pushUser }
  const pull = { ...connection, username: pullUser }

  return {
    pushFile: ({ filename, data }) =>
      withSftpSession({
        settings: push,
        work: (session) =>
          session.upload({ folder: pushFolder, filename, data })
      }),
    listPushFolder: () =>
      withSftpSession({
        settings: push,
        work: (session) => session.list(pushFolder)
      }),
    withPullSession: (work) =>
      withSftpSession({
        settings: pull,
        work: (session) =>
          work({
            list: () => session.list(pullFolder),
            stat: (filename) => session.stat({ folder: pullFolder, filename }),
            download: ({ filename, maxBytes, size }) =>
              session.download({
                folder: pullFolder,
                filename,
                maxBytes,
                size
              }),
            remove: (filename) =>
              session.remove({ folder: pullFolder, filename })
          })
      })
  }
}
