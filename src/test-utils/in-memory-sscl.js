import {
  sftpNoSuchFile,
  ssclError,
  ssclErrorCodes
} from '../common/helpers/sscl/sscl-errors.js'
import { assertSafeFilename } from '../services/sftp/safe-filename.js'
import { createSsclClient } from '../services/sftp/sscl-client.js'
import { buildReply, fakeSsclKeysFor } from './fake-sscl.js'
import { fakeSsclReplyTime } from './fixtures/sscl.js'
import { generatePgpTestKeys } from './pgp-test-keys.js'
import { nrfPgpKeysFor, ssclTestLimits } from './sscl-test-helpers.js'

/**
 * @typedef {import('../services/sftp/sftp-transport.js').SsclFile} SsclFile
 * @typedef {import('../services/sftp/sftp-transport.js').SsclTransport} SsclTransport
 * @typedef {import('../services/sftp/sftp-transport.js').PullSession} PullSession
 * @typedef {{ data: Buffer, modifyTime: number }} StoredFile
 */

/**
 * @param {SsclFile & { folder: Map<string, StoredFile>, modifyTime?: number }} file
 */
const putFile = ({ folder, filename, data, modifyTime = Date.now() }) =>
  folder.set(filename, { data, modifyTime })

/**
 * @param {Map<string, StoredFile>} folder
 */
const listing = (folder) =>
  [...folder]
    .map(([name, { data, modifyTime }]) => ({
      name,
      size: data.length,
      modifyTime
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

/**
 * @param {Map<string, StoredFile>} folder
 * @returns {PullSession}
 */
const createPullSession = (folder) => ({
  list: async () => listing(folder),
  async stat(filename) {
    assertSafeFilename(filename)
    return listing(folder).find((file) => file.name === filename)
  },
  async download({ filename, maxBytes }) {
    assertSafeFilename(filename)
    const file = folder.get(filename)
    if (!file) {
      throw Object.assign(new Error(`No such file: ${filename}`), {
        code: sftpNoSuchFile
      })
    }
    if (file.data.length > maxBytes) {
      throw ssclError({
        code: ssclErrorCodes.fileTooLarge,
        message: `In-memory SSCL file ${filename} is over ${maxBytes} bytes`
      })
    }
    return file.data
  },
  async remove(filename) {
    assertSafeFilename(filename)
    folder.delete(filename)
  }
})

/**
 * @param {{ pushFolder: Map<string, StoredFile>, pullFolder: Map<string, StoredFile> }} folders
 * @returns {SsclTransport}
 */
const createInMemoryTransport = ({ pushFolder, pullFolder }) => ({
  async pushFile({ filename, data }) {
    assertSafeFilename(filename)
    if (pushFolder.has(filename)) {
      throw ssclError({
        code: ssclErrorCodes.fileExists,
        message: `In-memory SSCL file ${filename} already exists`
      })
    }
    putFile({ folder: pushFolder, filename, data })
  },
  listPushFolder: async () => listing(pushFolder),
  withPullSession: (work) => work(createPullSession(pullFolder))
})

/**
 * An in-memory stand-in for MOVEit's push and pull folders, for unit tests
 * that need exact faults. Refuses unsafe names and reports a missing file as
 * the SFTP transport does. Starts with one reply from the fake SSCL in the pull
 * folder. Tests over real SFTP use the SFTP fault server instead.
 * @param {{ limits?: Partial<typeof ssclTestLimits> }} [options]
 */
export async function createInMemorySsclClient({ limits } = {}) {
  const pgp = await generatePgpTestKeys()
  /** @type {Map<string, StoredFile>} */
  const pushFolder = new Map()
  /** @type {Map<string, StoredFile>} */
  const pullFolder = new Map()

  const fakeSsclKeys = fakeSsclKeysFor(pgp)

  const dropReply = async (about) => {
    const reply = await buildReply({
      about,
      time: fakeSsclReplyTime,
      keys: fakeSsclKeys,
      maxFileBytes: ssclTestLimits.maxFileBytes
    })
    putFile({ folder: pullFolder, ...reply })
    return reply.filename
  }
  await dropReply('startup')

  const transport = createInMemoryTransport({ pushFolder, pullFolder })
  const client = createSsclClient({
    transport,
    keys: nrfPgpKeysFor(pgp),
    limits: { ...ssclTestLimits, ...limits }
  })

  return {
    client,
    sscl: {
      transport,
      fakeSsclKeys,
      pushFolder,
      /**
       * Puts a file in the pull folder as if SSCL had sent it.
       * @param {SsclFile & { modifyTime?: number }} file
       */
      dropInPullFolder: ({ filename, data, modifyTime }) =>
        putFile({ folder: pullFolder, filename, data, modifyTime }),
      /**
       * Puts a second good reply in the pull folder.
       * @returns {Promise<{ filename: string, names: string[] }>} the reply's
       * name, and the names now in the pull folder in the order they are listed
       */
      async dropSecondReply() {
        const filename = await dropReply('second')
        return { filename, names: listing(pullFolder).map((file) => file.name) }
      }
    }
  }
}
