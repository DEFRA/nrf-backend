import { createHash } from 'node:crypto'
import ssh2 from 'ssh2'

import { ssclErrorCodes } from '../../common/helpers/sscl/sscl-errors.js'
import {
  collectPulledFiles,
  overridePullSession,
  pulledStatuses,
  pullFolderNames,
  ssclTestLimits,
  withCode
} from '../../test-utils/sscl-test-helpers.js'
import { partialSuffix } from './partial-suffix.js'
import { createInMemorySsclClient } from '../../test-utils/in-memory-sscl.js'
import { buildReply, fakeSsclReplyFaults } from '../../test-utils/fake-sscl.js'
import { receiveAsFakeSscl } from '../../test-utils/fake-sscl-test-helpers.js'
import {
  fakeSsclReplyTime,
  fakeSsclStartupReplyFilename as replyFilename,
  ssclTestGarbageFile as garbageFile,
  ssclTestGarbageFirstFile as garbageFirstFile,
  ssclTestInvoiceFilename,
  ssclTestInvoiceText as invoiceText
} from '../../test-utils/fixtures/sscl.js'

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}))
vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const { STATUS_CODE } = ssh2.utils.sftp

describe('SSCL client', () => {
  let sscl
  let client

  beforeEach(async () => {
    ;({ sscl, client } = await createInMemorySsclClient())
  })

  it('hands over a verified file to be stored, then removes it from the pull folder', async () => {
    const { stored, onFile } = collectPulledFiles()

    const result = await client.pullFiles({ onFile })

    expect(result).toEqual({
      files: [
        {
          filename: replyFilename,
          size: expect.any(Number),
          status: 'received',
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          decryptedSize: stored[0].data.length
        }
      ],
      notProcessed: 0
    })
    expect(stored[0].data.toString()).toMatch(/^Fake SSCL reply about startup /)
    expect(stored[0].sha256).toBe(result.files[0].sha256)
    expect(await pullFolderNames(sscl.transport)).toEqual([])
  })

  it('leaves a file that fails verification without failing the others', async () => {
    sscl.dropInPullFolder(garbageFile)

    const { files } = await client.pullFiles(collectPulledFiles())

    expect(files.map(({ filename, status }) => ({ filename, status }))).toEqual(
      [
        { filename: replyFilename, status: 'received' },
        { filename: garbageFile.filename, status: 'unverified' }
      ]
    )
    expect(await pullFolderNames(sscl.transport)).toEqual([
      garbageFile.filename
    ])
  })

  it.each([
    ['is not signed', fakeSsclReplyFaults.unsigned],
    ["is signed by a key that is not SSCL's", fakeSsclReplyFaults.wrongKey]
  ])('leaves a file that %s as unverified', async (_case, fault) => {
    const reply = await buildReply({
      about: 'faulty',
      time: fakeSsclReplyTime,
      keys: sscl.fakeSsclKeys,
      maxFileBytes: ssclTestLimits.maxFileBytes,
      fault
    })
    sscl.dropInPullFolder(reply)

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toContainEqual([
      reply.filename,
      'unverified'
    ])
    expect(await pullFolderNames(sscl.transport)).toEqual([reply.filename])
  })

  it('logs the name, size and status of a file it could not verify', async () => {
    sscl.dropInPullFolder(garbageFile)

    await client.pullFiles(collectPulledFiles())

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(Error),
      `SSCL file ${garbageFile.filename} (${garbageFile.data.length} bytes) not received: unverified`
    )
  })

  it('leaves a file in place when it could not be stored', async () => {
    const { files } = await client.pullFiles({
      onFile: () => Promise.reject(new Error('database down'))
    })

    expect(files).toEqual([
      expect.objectContaining({ filename: replyFilename, status: 'not-stored' })
    ])
    expect(await pullFolderNames(sscl.transport)).toEqual([replyFilename])
  })

  it('leaves a file that was replaced after it was read', async () => {
    const { files } = await client.pullFiles({
      onFile: async ({ filename }) =>
        sscl.dropInPullFolder({ filename, data: Buffer.from('a new file') })
    })

    expect(files).toEqual([expect.objectContaining({ status: 'changed' })])
    expect(await pullFolderNames(sscl.transport)).toEqual([replyFilename])
  })

  it('leaves a file replaced by one of the same size after it was read', async () => {
    const { files } = await client.pullFiles({
      onFile: async ({ filename }) => {
        const [listed] = await sscl.transport.withPullSession((session) =>
          session.list()
        )
        sscl.dropInPullFolder({
          filename,
          data: Buffer.alloc(listed.size),
          modifyTime: listed.modifyTime + 1000
        })
      }
    })

    expect(files).toEqual([expect.objectContaining({ status: 'changed' })])
    expect(await pullFolderNames(sscl.transport)).toEqual([replyFilename])
  })

  it('leaves a file whose download is shorter than it was listed', async () => {
    overridePullSession({
      transport: sscl.transport,
      overrides: { download: async () => Buffer.from('short') }
    })
    const { stored, onFile } = collectPulledFiles()

    const { files } = await client.pullFiles({ onFile })

    expect(files).toEqual([expect.objectContaining({ status: 'changed' })])
    expect(stored).toEqual([])
    expect(await pullFolderNames(sscl.transport)).toEqual([replyFilename])
  })

  it('counts a file as received when another pull already removed it', async () => {
    const { files } = await client.pullFiles({
      onFile: ({ filename }) =>
        sscl.transport.withPullSession((session) => session.remove(filename))
    })

    expect(files).toEqual([expect.objectContaining({ status: 'received' })])
  })

  it('does not download a file over the size limit', async () => {
    ;({ sscl, client } = await createInMemorySsclClient({
      limits: { maxFileBytes: 10 }
    }))
    const download = vi.fn()
    overridePullSession({ transport: sscl.transport, overrides: { download } })

    const { files } = await client.pullFiles(collectPulledFiles())

    expect(files).toEqual([expect.objectContaining({ status: 'too-large' })])
    expect(download).not.toHaveBeenCalled()
    expect(await pullFolderNames(sscl.transport)).toEqual([replyFilename])
  })

  it('stops pulling when the connection is lost, leaving the rest for later', async () => {
    sscl.dropInPullFolder(garbageFile)
    overridePullSession({
      transport: sscl.transport,
      overrides: { download: () => Promise.reject(new Error('ECONNRESET')) }
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(result).toEqual({
      files: [
        {
          filename: replyFilename,
          size: expect.any(Number),
          status: 'download-failed'
        }
      ],
      notProcessed: 1
    })
  })

  it('counts a file that vanished before it was downloaded as gone, and carries on', async () => {
    sscl.dropInPullFolder(garbageFile)
    const noSuchFile = withCode(STATUS_CODE.NO_SUCH_FILE)
    overridePullSession({
      transport: sscl.transport,
      overrides: { download: () => Promise.reject(noSuchFile) }
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(result.files.map((file) => file.status)).toEqual(['gone', 'gone'])
    expect(result.notProcessed).toBe(0)
  })

  it('carries on when one file is not readable', async () => {
    sscl.dropInPullFolder(garbageFile)
    const permissionDenied = withCode(STATUS_CODE.PERMISSION_DENIED)
    overridePullSession({
      transport: sscl.transport,
      overrides: { download: () => Promise.reject(permissionDenied) }
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(result.files.map((file) => file.status)).toEqual([
      'download-failed',
      'download-failed'
    ])
    expect(result.notProcessed).toBe(0)
  })

  it('leaves out a file the sender is still uploading under a partial name', async () => {
    const partial = `${garbageFile.filename}${partialSuffix}`
    sscl.dropInPullFolder({ filename: partial, data: Buffer.from('half') })
    const pulledFiles = collectPulledFiles()

    const result = await client.pullFiles(pulledFiles)

    expect(result.files.map((file) => file.filename)).toEqual([replyFilename])
    expect(result.notProcessed).toBe(0)
    expect(pulledFiles.stored.map((file) => file.filename)).toEqual([
      replyFilename
    ])
    expect(await pullFolderNames(sscl.transport)).toContain(partial)
  })

  it('starts no new file once the time limit has passed', async () => {
    const result = await client.pullFiles({
      ...collectPulledFiles(),
      stopAfterMs: 0
    })

    expect(result).toEqual({ files: [], notProcessed: 1 })
  })

  it.each([
    ['a permission error', STATUS_CODE.PERMISSION_DENIED],
    ['a server failure', STATUS_CODE.FAILURE]
  ])(
    'reports a stored file it could not remove because of %s, and carries on',
    async (_case, code) => {
      const { filename: second, names } = await sscl.dropSecondReply()
      const { withPullSession } = sscl.transport
      overridePullSession({
        transport: sscl.transport,
        overrides: {
          remove: (filename) =>
            filename === second
              ? withPullSession((session) => session.remove(filename))
              : Promise.reject(withCode(code))
        }
      })

      const result = await client.pullFiles(collectPulledFiles())

      const statuses = { [second]: 'received', [replyFilename]: 'not-deleted' }
      expect(pulledStatuses(result)).toEqual(
        names.map((name) => [name, statuses[name]])
      )
      expect(result.notProcessed).toBe(0)
    }
  )

  it('stops pulling when removing a stored file loses the connection', async () => {
    const {
      names: [first]
    } = await sscl.dropSecondReply()
    overridePullSession({
      transport: sscl.transport,
      overrides: { remove: () => Promise.reject(new Error('ECONNRESET')) }
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual([[first, 'not-deleted']])
    expect(result.notProcessed).toBe(1)
  })

  it('tries files that failed before after new ones, so a bad file cannot block the pull', async () => {
    ;({ sscl, client } = await createInMemorySsclClient({
      limits: { maxFilesPerRun: 1 }
    }))
    sscl.dropInPullFolder(garbageFirstFile)

    const first = await client.pullFiles(collectPulledFiles())
    const second = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(first)).toEqual([
      [garbageFirstFile.filename, 'unverified']
    ])
    expect(pulledStatuses(second)).toEqual([[replyFilename, 'received']])
    expect(second.notProcessed).toBe(1)
  })

  it('warns when a pull only retried files that failed before', async () => {
    sscl.dropInPullFolder(garbageFirstFile)
    await client.pullFiles(collectPulledFiles())
    mockLogger.warn.mockClear()

    const { files } = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses({ files })).toEqual([
      [garbageFirstFile.filename, 'unverified']
    ])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { sscl: { retried: 1 } },
      'SSCL pull only retried files that failed before'
    )
  })

  it('treats a failing file that was replaced as new', async () => {
    ;({ sscl, client } = await createInMemorySsclClient({
      limits: { maxFilesPerRun: 1 }
    }))
    sscl.dropInPullFolder(garbageFirstFile)
    await client.pullFiles(collectPulledFiles())
    sscl.dropInPullFolder({
      ...garbageFirstFile,
      data: Buffer.from('not pgp either')
    })

    const { files } = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses({ files })).toEqual([
      [garbageFirstFile.filename, 'unverified']
    ])
  })

  it('tries a file whose download timed out last on the next pull', async () => {
    const {
      names: [first, later]
    } = await sscl.dropSecondReply()
    const restorePullSession = overridePullSession({
      transport: sscl.transport,
      overrides: {
        download: () => Promise.reject(withCode(ssclErrorCodes.timeout))
      }
    })
    const timedOut = await client.pullFiles(collectPulledFiles())
    restorePullSession()

    const next = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(timedOut)).toEqual([[first, 'download-failed']])
    expect(pulledStatuses(next)).toEqual([
      [later, 'received'],
      [first, 'received']
    ])
  })

  it('counts a file that outgrew the size limit after listing as changed, and carries on', async () => {
    const { names } = await sscl.dropSecondReply()
    overridePullSession({
      transport: sscl.transport,
      overrides: {
        download: () => Promise.reject(withCode(ssclErrorCodes.fileTooLarge))
      }
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(result.files.map((file) => file.status)).toEqual([
      'changed',
      'changed'
    ])
    expect(await pullFolderNames(sscl.transport)).toEqual(names)
  })

  it('counts a file as not stored when storing it takes too long, and accepts the next pull', async () => {
    const { files } = await client.pullFiles({
      onFile: () => new Promise(() => {}),
      storeTimeoutMs: 20
    })

    expect(pulledStatuses({ files })).toEqual([[replyFilename, 'not-stored']])
    expect(await pullFolderNames(sscl.transport)).toEqual([replyFilename])
    await expect(client.pullFiles(collectPulledFiles())).resolves.toMatchObject(
      { notProcessed: 0 }
    )
  })

  it('hands over the checksum of the file as it is in the pull folder', async () => {
    const [listed] = await sscl.transport.withPullSession(async (session) => [
      await session.download({
        filename: replyFilename,
        maxBytes: ssclTestLimits.maxFileBytes
      })
    ])
    const { stored, onFile } = collectPulledFiles()

    await client.pullFiles({ onFile })

    expect(stored[0].sha256).toBe(
      createHash('sha256').update(listed).digest('hex')
    )
  })

  it('refuses a second pull without connecting, then accepts one once the first has failed', async () => {
    const connecting = Promise.withResolvers()
    const withPullSession = vi
      .spyOn(sscl.transport, 'withPullSession')
      .mockReturnValueOnce(connecting.promise)
    const failing = client.pullFiles(collectPulledFiles())
    const refused = client.pullFiles(collectPulledFiles())

    await expect(refused).rejects.toMatchObject({
      code: 'SSCL_PULL_IN_PROGRESS'
    })
    expect(withPullSession).toHaveBeenCalledTimes(1)
    connecting.reject(new Error('auth failed'))
    await expect(failing).rejects.toThrow('auth failed')
    await expect(client.pullFiles(collectPulledFiles())).resolves.toMatchObject(
      { files: [expect.objectContaining({ status: 'received' })] }
    )
  })

  it('pulls no more files than its limit for one run, leaving the rest for later', async () => {
    ;({ sscl, client } = await createInMemorySsclClient({
      limits: { maxFilesPerRun: 1 }
    }))
    sscl.dropInPullFolder(garbageFile)

    const result = await client.pullFiles(collectPulledFiles())

    expect(result.files.map((file) => file.filename)).toEqual([replyFilename])
    expect(result.notProcessed).toBe(1)
  })

  it('runs one pull at a time', async () => {
    const first = client.pullFiles(collectPulledFiles())
    const second = client.pullFiles(collectPulledFiles())

    await expect(second).rejects.toMatchObject({
      code: 'SSCL_PULL_IN_PROGRESS'
    })
    await expect(first).resolves.toMatchObject({ notProcessed: 0 })
  })

  it('pushes a file the fake SSCL accepts as encrypted to SSCL and signed by NRF', async () => {
    await client.pushFile({
      filename: ssclTestInvoiceFilename,
      data: Buffer.from(invoiceText)
    })

    const receipt = await receiveAsFakeSscl({
      data: sscl.pushFolder.get(ssclTestInvoiceFilename).data,
      keys: sscl.fakeSsclKeys
    })
    expect(receipt).toEqual({
      accepted: true,
      problems: [],
      contents: Buffer.from(invoiceText)
    })
  })

  it('logs the name and size of a pushed file but never its content', async () => {
    const content = 'content that must not be logged'

    await client.pushFile({
      filename: ssclTestInvoiceFilename,
      data: Buffer.from(content)
    })

    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        sscl: {
          filename: ssclTestInvoiceFilename,
          size: sscl.pushFolder.get(ssclTestInvoiceFilename).data.length
        }
      },
      'SSCL file pushed'
    )
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain(content)
  })

  it('refuses to push over a file of the same name', async () => {
    const file = {
      filename: ssclTestInvoiceFilename,
      data: Buffer.from(invoiceText)
    }
    await client.pushFile(file)

    await expect(client.pushFile(file)).rejects.toMatchObject({
      code: 'SSCL_FILE_EXISTS'
    })
  })

  it('refuses to push a file whose name is kept for uploads in progress', async () => {
    await expect(
      client.pushFile({
        filename: `${ssclTestInvoiceFilename}${partialSuffix}`,
        data: Buffer.from(invoiceText)
      })
    ).rejects.toMatchObject({ code: 'SSCL_INVALID_FILENAME' })
    expect(await client.listPushFolder()).toEqual([])
  })

  it('refuses to push a file that is over the size limit once encrypted', async () => {
    ;({ sscl, client } = await createInMemorySsclClient({
      limits: { maxFileBytes: 100 }
    }))

    await expect(
      client.pushFile({
        filename: ssclTestInvoiceFilename,
        data: Buffer.from(invoiceText)
      })
    ).rejects.toMatchObject({ code: 'SSCL_PUSH_TOO_LARGE' })
    expect(await client.listPushFolder()).toEqual([])
  })

  it('refuses to push a file with no data', async () => {
    await expect(
      client.pushFile({
        filename: ssclTestInvoiceFilename,
        data: Buffer.alloc(0)
      })
    ).rejects.toMatchObject({
      code: 'SSCL_EMPTY_FILE',
      message: `Refusing to push ${ssclTestInvoiceFilename} with no data`
    })
    expect(await client.listPushFolder()).toEqual([])
  })

  it('logs file metadata but never the decrypted content', async () => {
    const { stored, onFile } = collectPulledFiles()

    await client.pullFiles({ onFile })

    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        sscl: {
          filename: replyFilename,
          size: expect.any(Number),
          status: 'received',
          sha256: expect.any(String),
          decryptedSize: expect.any(Number)
        }
      },
      'SSCL file received'
    )
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain(
      stored[0].data.toString()
    )
  })
})
