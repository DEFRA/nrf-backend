import path from 'node:path'
import ssh2 from 'ssh2'
import { generateSshTestKeyPair } from './ssh-test-keys.js'

const { STATUS_CODE, OPEN_MODE } = ssh2.utils.sftp

const fileMode = 0o100644
const folderMode = 0o040755

/**
 * What the fault hook can make the server do with one request instead of
 * answering it normally: answer with an SFTP status code, never answer, or
 * drop the connection.
 * @typedef {{ status: number } | { stall: true } | { close: true }} SftpFault
 */

/**
 * @typedef {'open' | 'read' | 'write' | 'close' | 'lstat' | 'stat' | 'opendir' | 'readdir' | 'remove' | 'rename' | 'realpath' | 'setstat'} SftpOperation
 */

/**
 * @typedef {(request: { operation: SftpOperation, path: string }) => SftpFault | undefined} SftpFaultHook
 */

/**
 * @typedef {{ data: Buffer, modifyTime: number }} FaultServerFile
 */

/**
 * @param {number} ms
 */
const seconds = (ms) => Math.floor(ms / 1000)

/**
 * @param {FaultServerFile} file
 */
const fileAttrs = ({ data, modifyTime }) => ({
  mode: fileMode,
  uid: 0,
  gid: 0,
  size: data.length,
  atime: seconds(modifyTime),
  mtime: seconds(modifyTime)
})

const folderAttrs = () => ({
  mode: folderMode,
  uid: 0,
  gid: 0,
  size: 0,
  atime: 0,
  mtime: 0
})

/**
 * The SFTP request handlers for one session, over the server's files.
 * @param {{ sftp: any, files: Map<string, FaultServerFile>, folders: Set<string>, fault: () => SftpFaultHook, closeConnection: () => void }} params
 */
const serveSftp = ({ sftp, files, folders, fault, closeConnection }) => {
  const handles = new Map()
  let nextHandle = 0

  const newHandle = (state) => {
    const handle = Buffer.alloc(4)
    handle.writeUInt32BE(nextHandle++)
    handles.set(handle.toString('hex'), state)
    return handle
  }
  const handleState = (handle) => handles.get(handle.toString('hex'))

  const attrsOf = (remotePath) => {
    const file = files.get(remotePath)
    if (file) {
      return fileAttrs(file)
    }
    return folders.has(remotePath) ? folderAttrs() : undefined
  }

  /**
   * Runs a handler unless the fault hook says otherwise.
   * @param {{ operation: SftpOperation, handler: (reqid: number, ...args: any[]) => void, pathOf: (...args: any[]) => string }} params
   */
  const on = ({ operation, handler, pathOf }) => {
    sftp.on(operation.toUpperCase(), function handleRequest(reqid, ...args) {
      const outcome = fault()({ operation, path: pathOf(...args) })
      if (outcome && 'stall' in outcome) {
        return
      }
      if (outcome && 'close' in outcome) {
        closeConnection()
        return
      }
      if (outcome && 'status' in outcome) {
        sftp.status(reqid, outcome.status)
        return
      }
      handler(reqid, ...args)
    })
  }
  const byPath = (remotePath) => remotePath
  const byHandle = (handle) => handleState(handle)?.path ?? ''

  /**
   * Gives a handler the state of an open handle. Answers FAILURE instead when
   * the handle is not open: it was closed, or the server never issued it.
   * @param {(reqid: number, state: any, ...args: any[]) => void} handler
   */
  const withOpenHandle = (handler) =>
    function onRequestForHandle(reqid, handle, ...args) {
      const state = handleState(handle)
      if (!state) {
        sftp.status(reqid, STATUS_CODE.FAILURE)
        return
      }
      handler(reqid, state, ...args)
    }

  on({
    operation: 'realpath',
    handler: (reqid, remotePath) => {
      const resolved = path.posix.resolve('/', remotePath)
      sftp.name(reqid, [{ filename: resolved, longname: resolved, attrs: {} }])
    },
    pathOf: byPath
  })

  const statHandler = (reqid, remotePath) => {
    const attrs = attrsOf(remotePath)
    if (attrs) {
      sftp.attrs(reqid, attrs)
    } else {
      sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
    }
  }
  on({ operation: 'lstat', handler: statHandler, pathOf: byPath })
  on({ operation: 'stat', handler: statHandler, pathOf: byPath })

  on({
    operation: 'opendir',
    handler: (reqid, remotePath) => {
      if (!folders.has(remotePath)) {
        sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
        return
      }
      sftp.handle(reqid, newHandle({ path: remotePath, listed: false }))
    },
    pathOf: byPath
  })

  on({
    operation: 'readdir',
    handler: withOpenHandle(function readdir(reqid, state) {
      if (state.listed) {
        sftp.status(reqid, STATUS_CODE.EOF)
        return
      }
      state.listed = true
      const entries = [...files]
        .filter(([name]) => path.posix.dirname(name) === state.path)
        .map(([name, file]) => ({
          filename: path.posix.basename(name),
          // ssh2-sftp-client reads the file type from this `ls -l` style line
          longname: `-rw-r--r-- 1 0 0 ${file.data.length} Jan 1 00:00 ${path.posix.basename(name)}`,
          attrs: fileAttrs(file)
        }))
      sftp.name(reqid, entries)
    }),
    pathOf: byHandle
  })

  on({
    operation: 'open',
    handler: (reqid, remotePath, flags) => {
      if (!folders.has(path.posix.dirname(remotePath))) {
        sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
        return
      }
      if (flags & OPEN_MODE.WRITE) {
        files.set(remotePath, { data: Buffer.alloc(0), modifyTime: Date.now() })
      } else if (!files.has(remotePath)) {
        sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
        return
      }
      sftp.handle(reqid, newHandle({ path: remotePath }))
    },
    pathOf: byPath
  })

  on({
    operation: 'read',
    handler: withOpenHandle(function read(reqid, state, offset, length) {
      const file = files.get(state.path)
      if (!file || offset >= file.data.length) {
        sftp.status(reqid, STATUS_CODE.EOF)
        return
      }
      sftp.data(reqid, file.data.subarray(offset, offset + length))
    }),
    pathOf: byHandle
  })

  on({
    operation: 'write',
    handler: withOpenHandle(function write(reqid, state, offset, data) {
      const file = files.get(state.path)
      if (!file) {
        sftp.status(reqid, STATUS_CODE.FAILURE)
        return
      }
      const end = offset + data.length
      const grown = Buffer.alloc(Math.max(file.data.length, end))
      file.data.copy(grown)
      data.copy(grown, offset)
      file.data = grown
      file.modifyTime = Date.now()
      sftp.status(reqid, STATUS_CODE.OK)
    }),
    pathOf: byHandle
  })

  on({
    operation: 'close',
    handler: (reqid, handle) => {
      handles.delete(handle.toString('hex'))
      sftp.status(reqid, STATUS_CODE.OK)
    },
    pathOf: byHandle
  })

  const setstatHandler = (reqid) => sftp.status(reqid, STATUS_CODE.OK)
  on({ operation: 'setstat', handler: setstatHandler, pathOf: byPath })
  sftp.on('FSETSTAT', setstatHandler)

  on({
    operation: 'remove',
    handler: (reqid, remotePath) => {
      sftp.status(
        reqid,
        files.delete(remotePath) ? STATUS_CODE.OK : STATUS_CODE.NO_SUCH_FILE
      )
    },
    pathOf: byPath
  })

  on({
    operation: 'rename',
    handler: (reqid, from, to) => {
      const file = files.get(from)
      if (!file) {
        sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
        return
      }
      // As OpenSSH's sftp-server: a rename never replaces an existing file.
      if (files.has(to)) {
        sftp.status(reqid, STATUS_CODE.FAILURE)
        return
      }
      files.delete(from)
      files.set(to, file)
      sftp.status(reqid, STATUS_CODE.OK)
    },
    pathOf: byPath
  })
}

/**
 * Starts an in-process SFTP server on a random local port, for tests that
 * need faults a real server won't produce on demand: a chosen status code for
 * one request, a request that is never answered, or a dropped connection.
 * Files live in memory, keyed by full path, in the given folders. Any client
 * key is accepted; clients must pin the server's host key.
 * @param {{ folders: string[], fault?: SftpFaultHook }} params
 */
export async function startSftpFaultServer({
  folders,
  fault = () => undefined
}) {
  const hostKey = generateSshTestKeyPair()
  /** @type {Map<string, FaultServerFile>} */
  const files = new Map()
  const knownFolders = new Set(folders)
  const connections = new Set()
  const logins = []
  let currentFault = fault

  const server = new ssh2.Server(
    { hostKeys: [hostKey.private] },
    function onConnection(client) {
      connections.add(client)
      // ssh2 sends each packet as several small writes. On Linux, Nagle's
      // algorithm would hold each one back for about 40 ms.
      client.setNoDelay(true)
      client.on('close', () => connections.delete(client))
      client.on('error', () => {})
      client.on('authentication', function onAuthentication(ctx) {
        if (ctx.method !== 'publickey') {
          ctx.reject(['publickey'])
          return
        }
        // A client first asks whether the key would do, then signs with it
        if (ctx.signature) {
          logins.push(ctx.username)
        }
        ctx.accept()
      })
      client.on('ready', function onReady() {
        client.on('session', function onSession(acceptSession) {
          acceptSession().on('sftp', function onSftp(acceptSftp) {
            serveSftp({
              sftp: acceptSftp(),
              files,
              folders: knownFolders,
              fault: () => currentFault,
              closeConnection: () => client.end()
            })
          })
        })
      })
    }
  )

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const clientKey = generateSshTestKeyPair()

  return {
    files,
    /** The number of SSH connections still open on the server side. */
    openConnections: () => connections.size,
    /** The username of each login the server accepted, in order. */
    logins: () => [...logins],
    /**
     * @param {SftpFaultHook} next
     */
    setFault(next) {
      currentFault = next
    },
    /**
     * Connection settings for an SFTP client, in the shape withSftpSession
     * takes.
     * @param {{ timeoutMs?: number }} [overrides]
     */
    settings: ({ timeoutMs = 2000 } = {}) => ({
      host: '127.0.0.1',
      port,
      username: 'fault-test',
      privateKey: clientKey.private,
      hostKey: hostKey.public,
      timeoutMs
    }),
    /**
     * @param {{ folder: string, filename: string, data: Buffer, modifyTime?: number }} file
     */
    putFile: ({ folder, filename, data, modifyTime = Date.now() }) =>
      files.set(path.posix.join(folder, filename), { data, modifyTime }),
    /**
     * @param {string} folder
     */
    namesIn: (folder) =>
      [...files.keys()]
        .filter((name) => path.posix.dirname(name) === folder)
        .map((name) => path.posix.basename(name))
        .sort((a, b) => a.localeCompare(b)),
    close: () =>
      new Promise((resolve) => {
        connections.forEach((client) => client.end())
        server.close(resolve)
      })
  }
}
