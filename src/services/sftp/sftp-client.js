import { randomBytes } from 'node:crypto'
import net from 'node:net'
import path from 'node:path'
import SftpClient from 'ssh2-sftp-client'

import { createLogger } from '../../common/helpers/logging/logger.js'
import { withTimeout } from '../../common/helpers/with-timeout.js'
import { createHostVerifier } from '../../common/helpers/sscl/host-key.js'
import {
  ssclError,
  ssclErrorCodes
} from '../../common/helpers/sscl/sscl-errors.js'
import { openProxyTunnel } from './proxy-tunnel.js'
import { partialSuffix } from './partial-suffix.js'
import { assertSafeFilename } from './safe-filename.js'

const logger = createLogger()

/** How long a clean disconnect may take before the socket is closed anyway. */
export const disconnectLimitMs = 5000

/**
 * The longest a caller waits for a partial upload to be removed from a fresh
 * session, so that an upload that has failed is not reported much later.
 */
export const cleanupLimitMs = 10000

const ignoreError = () => {}

/**
 * The slowest transfer rate allowed before an upload or download times out,
 * on top of timeoutMs. At 100 KB/s a 20 MB file has about 200 extra seconds.
 */
export const minBytesPerSecond = 100 * 1024

const msPerSecond = 1000

/** Random bytes in a partial upload's name, so two uploads never share one. */
const partialIdBytes = 4

/**
 * @typedef {object} SftpConnectionSettings
 * @property {string} host
 * @property {number} port
 * @property {string} username
 * @property {string} privateKey - OpenSSH or PEM private key text
 * @property {string} hostKey - pinned server host key (see createHostVerifier)
 * @property {number} timeoutMs - limit for connecting and for each operation;
 *   uploads and downloads also get time for their size (see transferTimeoutMs)
 * @property {string} [proxyUrl] - HTTP CONNECT proxy to tunnel through
 */

/**
 * @typedef {object} SftpFile
 * @property {string} name
 * @property {number} size
 * @property {number} modifyTime - milliseconds since the epoch
 */

/**
 * @typedef {{ folder: string, filename: string }} SftpFileRef
 */

/**
 * File operations on one connected SFTP session. Once an operation times out
 * the connection is closed, so the operations after it fail at once.
 * @typedef {object} SftpSession
 * @property {(folder: string) => Promise<SftpFile[]>} list - regular files, by name
 * @property {(ref: SftpFileRef) => Promise<SftpFile | undefined>} stat
 * @property {(file: SftpFileRef & { data: Buffer }) => Promise<void>} upload
 *   - never overwrites, and never leaves a partial file under the final name
 * @property {(file: SftpFileRef & { maxBytes: number, size?: number }) => Promise<Buffer>} download
 *   - size, the listed size if known, sets the time limit; maxBytes otherwise
 * @property {(ref: SftpFileRef) => Promise<void>} remove - succeeds if already gone
 */

/**
 * @param {SftpFileRef} params
 */
const filePath = ({ folder, filename }) => {
  assertSafeFilename(filename)
  return path.posix.join(folder, filename)
}

/**
 * @param {string} message
 */
const timeoutError = (message) =>
  ssclError({ code: ssclErrorCodes.timeout, message })

/**
 * @param {string} filename
 */
const fileExistsError = (filename) =>
  ssclError({
    code: ssclErrorCodes.fileExists,
    message: `SFTP file ${filename} already exists`
  })

/**
 * The time limit for moving a number of bytes.
 * @param {{ timeoutMs: number, bytes: number }} params
 */
export const transferTimeoutMs = ({ timeoutMs, bytes }) =>
  timeoutMs + Math.ceil((bytes / minBytesPerSecond) * msPerSecond)

/**
 * Runs an SFTP operation within a time limit, failing with a timeout error.
 * @template T
 * @param {{ name: string, timeoutMs: number, operation: () => Promise<T>, onTimeout?: () => void }} params
 * @returns {Promise<T>}
 */
const timedOperation = ({ name, timeoutMs, operation, onTimeout }) =>
  withTimeout({
    timeoutMs,
    work: operation,
    makeError: () =>
      timeoutError(`SFTP ${name} timed out after ${timeoutMs}ms`),
    onTimeout
  })

/**
 * @param {{ host: string, port: number, timeoutMs: number }} params
 * @returns {Promise<net.Socket>}
 */
const connectDirect = ({ host, port, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    const fail = (error) => {
      clearTimeout(timer)
      socket.destroy()
      reject(error)
    }
    const timer = setTimeout(function onTimedOut() {
      fail(
        timeoutError(
          `SFTP connect to ${host}:${port} timed out after ${timeoutMs}ms`
        )
      )
    }, timeoutMs)
    socket.once('error', fail)
    socket.once('connect', function onConnect() {
      clearTimeout(timer)
      socket.off('error', fail)
      // Until the caller adds its own listener, an 'error' on the socket would
      // be uncaught and stop the process.
      socket.on('error', ignoreError)
      resolve(socket)
    })
  })

/**
 * Opens the TCP connection ourselves, directly or through the proxy, so a
 * timeout can close it: ssh2's own end() does nothing once the socket is
 * ending, and would let an upload or rename finish after we gave up on it.
 *
 * Turns off Nagle's algorithm, as SSH clients do. Without its native add-on
 * (not built in our image) ssh2 sends each packet as several small writes, and
 * on Linux Nagle's algorithm then holds each packet back for about 40 ms.
 * @param {SftpConnectionSettings} settings
 */
const openSocket = async ({ proxyUrl, host, port, timeoutMs }) => {
  const socket = await (proxyUrl
    ? openProxyTunnel({ proxyUrl, host, port, timeoutMs })
    : connectDirect({ host, port, timeoutMs }))
  socket.setNoDelay(true)
  return socket
}

/**
 * @param {{ settings: SftpConnectionSettings, hostVerifier: (key: Buffer) => boolean, socket: net.Socket }} params
 */
const connectOptions = ({ settings, hostVerifier, socket }) => ({
  host: settings.host,
  port: settings.port,
  username: settings.username,
  privateKey: settings.privateKey,
  hostVerifier,
  readyTimeout: settings.timeoutMs,
  sock: socket
})

/**
 * The SFTP client and its socket. isOpen is false once the socket has ended,
 * closed or failed, which includes the server closing it cleanly: ssh2 gives
 * up on the session then, before the socket is destroyed.
 * @typedef {{ client: SftpClient, socket: net.Socket, isOpen: () => boolean }} Connection
 */

/**
 * @param {{ client: SftpClient, socket: net.Socket }} params
 * @returns {Connection}
 */
const trackConnection = ({ client, socket }) => {
  let ended = false
  const markEnded = () => {
    ended = true
  }
  socket.once('end', markEnded)
  socket.once('close', markEnded)
  socket.on('error', markEnded)
  return { client, socket, isOpen: () => !ended && !socket.destroyed }
}

/**
 * Whether this upload has left a partial file on the server that still needs
 * removing.
 * @typedef {{ partialLeft: boolean }} UploadState
 */

/**
 * @param {Connection & { partial: string, state: UploadState }} params
 */
const removePartialUpload = async ({ client, isOpen, partial, state }) => {
  if (!isOpen()) {
    return
  }
  try {
    await client.delete(partial, true)
    state.partialLeft = false
  } catch (error) {
    logger.error(error, 'SFTP could not remove a partial upload')
  }
}

/**
 * @param {Connection & { target: string }} params
 */
const targetNowExists = async ({ client, isOpen, target }) => {
  if (!isOpen()) {
    return false
  }
  try {
    return Boolean(await client.exists(target))
  } catch {
    return false
  }
}

/**
 * Uploads under a partial name unique to this upload, then renames it. The
 * server refuses a rename onto an existing file, so of two uploads of the
 * same name at once only one gets the name; the other gets fileExists.
 * @param {{ connection: Connection, file: SftpFileRef & { data: Buffer }, partialName: string, state: UploadState }} params
 */
const uploadWithoutOverwriting = async ({
  connection,
  file,
  partialName,
  state
}) => {
  const { client } = connection
  const target = filePath(file)
  if (await client.exists(target)) {
    throw fileExistsError(file.filename)
  }
  const partial = path.posix.join(file.folder, partialName)
  state.partialLeft = true
  try {
    await client.put(file.data, partial)
  } catch (error) {
    await removePartialUpload({ ...connection, partial, state })
    throw error
  }
  try {
    await client.rename(partial, target)
    state.partialLeft = false
  } catch (error) {
    await removePartialUpload({ ...connection, partial, state })
    if (await targetNowExists({ ...connection, target })) {
      throw fileExistsError(file.filename)
    }
    throw error
  }
}

/**
 * @param {{ client: SftpClient, file: SftpFileRef & { maxBytes: number } }} params
 */
const downloadUpTo = async ({ client, file }) => {
  // end is inclusive, so this reads at most maxBytes + 1 bytes
  const data = await client.get(filePath(file), undefined, {
    readStreamOptions: { end: file.maxBytes }
  })
  if (data.length > file.maxBytes) {
    throw ssclError({
      code: ssclErrorCodes.fileTooLarge,
      message: `SFTP file ${file.filename} is over ${file.maxBytes} bytes`
    })
  }
  return data
}

/**
 * @param {{ client: SftpClient, ref: SftpFileRef }} params
 * @returns {Promise<SftpFile | undefined>}
 */
const statFile = async ({ client, ref }) => {
  const remotePath = filePath(ref)
  if ((await client.exists(remotePath)) !== '-') {
    return undefined
  }
  const { size, modifyTime } = await client.stat(remotePath)
  return { name: ref.filename, size, modifyTime }
}

/**
 * @param {{ client: SftpClient, folder: string }} params
 * @returns {Promise<SftpFile[]>}
 */
const listFiles = async ({ client, folder }) => {
  const entries = await client.list(folder)
  return entries
    .filter((entry) => entry.type === '-')
    .map(({ name, size, modifyTime }) => ({ name, size, modifyTime }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * @param {{ connection: Connection, timeoutMs: number, leftovers: SftpFileRef[] }} params
 *   leftovers collects partial uploads that could not be removed in this session
 * @returns {SftpSession}
 */
const createSession = ({ connection, timeoutMs, leftovers }) => {
  const { client, socket, isOpen } = connection
  /**
   * @template T
   * @param {{ name: string, operation: () => Promise<T>, bytes?: number }} params
   * @returns {Promise<T>}
   */
  const timed = async ({ name, operation, bytes }) => {
    if (!isOpen()) {
      throw ssclError({
        code: ssclErrorCodes.connectionClosed,
        message: `SFTP ${name} not tried: the connection is closed`
      })
    }
    return timedOperation({
      name,
      timeoutMs:
        bytes === undefined
          ? timeoutMs
          : transferTimeoutMs({ timeoutMs, bytes }),
      operation,
      onTimeout: () => socket.destroy()
    })
  }

  return {
    list: (folder) =>
      timed({ name: 'list', operation: () => listFiles({ client, folder }) }),
    stat: (ref) =>
      timed({ name: 'stat', operation: () => statFile({ client, ref }) }),
    async upload(file) {
      const partialName = `${file.filename}.${randomBytes(partialIdBytes).toString('hex')}${partialSuffix}`
      /** @type {UploadState} */
      const state = { partialLeft: false }
      try {
        await timed({
          name: 'upload',
          bytes: file.data.length,
          operation: () =>
            uploadWithoutOverwriting({ connection, file, partialName, state })
        })
      } catch (error) {
        if (state.partialLeft) {
          leftovers.push({ folder: file.folder, filename: partialName })
        }
        throw error
      }
    },
    download: (file) =>
      timed({
        name: 'download',
        bytes: file.size ?? file.maxBytes,
        operation: () => downloadUpTo({ client, file })
      }),
    remove: async (ref) => {
      await timed({
        name: 'delete',
        operation: () => client.delete(filePath(ref), true)
      })
    }
  }
}

/**
 * Ends the session cleanly if the connection is still open, but never waits
 * longer than disconnectLimitMs, then closes the socket.
 * @param {{ client: SftpClient, connection?: Connection }} params
 */
const disconnect = async ({ client, connection }) => {
  if (!connection || connection.isOpen()) {
    try {
      await timedOperation({
        name: 'disconnect',
        timeoutMs: disconnectLimitMs,
        operation: () => client.end()
      })
    } catch (error) {
      logger.error(error, 'SFTP disconnect failed')
    }
  }
  connection?.socket.destroy()
}

/**
 * Removes partial uploads the session could not remove itself (the connection
 * was lost, or the removal failed), from a fresh session. Best effort: a
 * failure is logged, not thrown, so the caller sees the error that stopped the
 * upload. The whole session gets cleanupLimitMs, then its connection is closed.
 * @param {{ settings: SftpConnectionSettings, partials: SftpFileRef[] }} params
 */
const removeLeftoverPartials = async ({ settings, partials }) => {
  /** @type {net.Socket | undefined} */
  let socket
  try {
    await timedOperation({
      name: 'removal of a partial upload',
      timeoutMs: cleanupLimitMs,
      operation: () =>
        runSession({
          settings: {
            ...settings,
            timeoutMs: Math.min(settings.timeoutMs, cleanupLimitMs)
          },
          onSocket: (opened) => {
            socket = opened
          },
          work: async (session) => {
            for (const partial of partials) {
              await session.remove(partial)
            }
          }
        }),
      onTimeout: () => socket?.destroy()
    })
  } catch (error) {
    logger.error(error, 'SFTP could not remove a partial upload')
  }
}

/**
 * ssh2-sftp-client's handlers for connection events outside an operation. Its
 * defaults write to the console; an end or close is expected when we close
 * the socket, and an error is reported by the operation it breaks.
 */
const quietEvents = {
  error: (error) => logger.warn(error, 'SFTP connection error'),
  end: () => {},
  close: () => {}
}

/**
 * @template T
 * @param {{ settings: SftpConnectionSettings, work: (session: SftpSession) => Promise<T>, onSocket?: (socket: net.Socket) => void }} params
 * @returns {Promise<T>}
 */
async function runSession({ settings, work, onSocket = () => {} }) {
  // Before any network traffic, so an unusable host key opens no connection
  const hostVerifier = createHostVerifier(settings.hostKey)
  const context = {
    sftp: {
      host: settings.host,
      port: settings.port,
      username: settings.username
    }
  }
  const client = new SftpClient('sftp', quietEvents)
  /** @type {Connection | undefined} */
  let connection
  /** @type {SftpFileRef[]} */
  const leftovers = []
  try {
    logger.info(context, 'SFTP connecting')
    const socket = await openSocket(settings)
    onSocket(socket)
    connection = trackConnection({ client, socket })
    // ssh2's readyTimeout stops at sign-in. Opening the SFTP session after
    // that has no limit of its own.
    await timedOperation({
      name: 'session start',
      timeoutMs: settings.timeoutMs,
      operation: () =>
        client.connect(connectOptions({ settings, hostVerifier, socket })),
      onTimeout: () => socket.destroy()
    })
    logger.info(context, 'SFTP connected')
    return await work(
      createSession({ connection, timeoutMs: settings.timeoutMs, leftovers })
    )
  } finally {
    await disconnect({ client, connection })
    if (leftovers.length > 0) {
      await removeLeftoverPartials({ settings, partials: leftovers })
    }
  }
}

/**
 * Connects as settings.username, runs work with one session for all its
 * operations, then always disconnects. Errors are thrown, not logged, so the
 * caller can log them once with its own context.
 * @template T
 * @param {{ settings: SftpConnectionSettings, work: (session: SftpSession) => Promise<T> }} params
 * @returns {Promise<T>}
 */
export const withSftpSession = ({ settings, work }) =>
  runSession({ settings, work })
