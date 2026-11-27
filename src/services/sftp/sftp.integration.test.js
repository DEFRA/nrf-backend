import { config } from '../../config.js'
import { createSsclClient } from './sscl-client.js'
import { createSftpTransport } from './sftp-transport.js'
import { getSsclClient, resetSsclClient } from './get-sscl-client.js'
import { decryptAndVerify } from '../../common/helpers/sscl/pgp.js'
import { isNoSuchFileError } from '../../common/helpers/sscl/sscl-errors.js'
import { generatePgpTestKeys } from '../../test-utils/pgp-test-keys.js'
import { startConnectProxy } from '../../test-utils/connect-proxy.js'
import { startTcpForwarder } from '../../test-utils/tcp-forwarder.js'
import { withSftpSession } from './sftp-client.js'
import {
  collectPulledFiles,
  nrfPgpKeysFor,
  runBeforeEachDownload,
  ssclTestLimits,
  uniqueTestFilename
} from '../../test-utils/sscl-test-helpers.js'
import { sentBySscl } from '../../test-utils/fake-sscl-test-helpers.js'
import {
  asSftpTestUser as asUser,
  clearSftpTestFolders,
  getFromSftpTestFolder as getFromFolder,
  loadSftpTestServerConfig,
  namesInSftpTestFolder as namesInFolder,
  putInSftpTestFolder as putInFolder,
  sftpTestConnection,
  sftpTestDirections,
  sftpContainerFolders,
  sftpTestHookTimeoutMs,
  sftpTestSettings,
  sftpTestTimeoutMs,
  sftpTestUsers
} from '../../test-utils/sftp-test-server.js'
import { generateSshTestKeyPair } from '../../test-utils/ssh-test-keys.js'

// One file, so these run in sequence against the shared SFTP container folders.

const { push, pull } = sftpTestDirections
const maxBytes = 1024
const fromSsclText = 'from SSCL'
const notPgpFilename = 'NOT_PGP.txt'
const testPrefix = 'TEST'
const ssclTestPrefix = 'SSCL_TEST'
const nrfTestPrefix = 'NRF_TEST'
const firstText = 'first'
const secondText = 'second'
const oneByte = Buffer.from('x')

describe(
  'SFTP session against the local SFTP server',
  { timeout: sftpTestTimeoutMs },
  () => {
    beforeEach(async () => {
      await clearSftpTestFolders()
    }, sftpTestHookTimeoutMs)

    it('fails a download of a missing file with the no-such-file error the pull relies on', async () => {
      const download = getFromFolder({
        direction: pull,
        filename: uniqueTestFilename(testPrefix),
        maxBytes
      })

      await expect(download).rejects.toSatisfy(isNoSuchFileError)
    })

    it('uploads a file, lists it, stats it and downloads it again in one session', async () => {
      const filename = uniqueTestFilename(testPrefix)
      const data = Buffer.from('hello SSCL')
      const folder = sftpContainerFolders.push

      const result = await asUser({
        direction: push,
        work: async function uploadThenReadBack(session) {
          await session.upload({ folder, filename, data })
          return {
            files: await session.list(folder),
            stat: await session.stat({ folder, filename }),
            downloaded: await session.download({ folder, filename, maxBytes })
          }
        }
      })

      const file = {
        name: filename,
        size: data.length,
        modifyTime: expect.any(Number)
      }
      expect(result.files).toEqual([file])
      expect(result.stat).toEqual(file)
      expect(result.downloaded).toEqual(data)
    })

    it('refuses to upload over an existing file and leaves no partial file', async () => {
      const filename = uniqueTestFilename(testPrefix)
      await putInFolder({
        direction: push,
        filename,
        data: Buffer.from(firstText)
      })

      await expect(
        putInFolder({
          direction: push,
          filename,
          data: Buffer.from(secondText)
        })
      ).rejects.toMatchObject({ code: 'SSCL_FILE_EXISTS' })
      expect(await namesInFolder({ direction: push })).toEqual([filename])
    })

    it('lets only one of two uploads of the same name at once take the name, and leaves no partial file', async () => {
      const filename = uniqueTestFilename(testPrefix)
      const folder = sftpContainerFolders.push
      const texts = [firstText, secondText]

      // In one session, so both existence checks are usually answered before
      // either upload is renamed and the server's refusal to rename decides.
      // Either way, exactly one upload must take the name.
      const outcomes = await asUser({
        direction: push,
        work: function uploadBothAtOnce(session) {
          return Promise.allSettled(
            texts.map((text) =>
              session.upload({ folder, filename, data: Buffer.from(text) })
            )
          )
        }
      })

      const winner = texts[outcomes.findIndex((o) => o.status === 'fulfilled')]
      expect(outcomes.map((o) => o.status).sort()).toEqual([
        'fulfilled',
        'rejected'
      ])
      expect(
        outcomes.find((o) => o.status === 'rejected').reason
      ).toMatchObject({ code: 'SSCL_FILE_EXISTS' })
      expect(await namesInFolder({ direction: push })).toEqual([filename])
      const stored = await getFromFolder({
        direction: push,
        filename,
        maxBytes
      })
      expect(stored.toString()).toBe(winner)
    })

    it('gives up on a download when the network stops answering, without waiting for a clean disconnect', async () => {
      const filename = uniqueTestFilename(testPrefix)
      await putInFolder({ direction: pull, filename, data: oneByte })
      const { host, port } = sftpTestConnection()
      const forwarder = await startTcpForwarder({
        targetHost: host,
        targetPort: port
      })
      // Also limits the SSH handshake through the forwarder, so long enough for
      // that while other test files run, after the suite's first handshake has
      // warmed up the container
      const timeoutMs = 5000
      let started
      try {
        const download = withSftpSession({
          settings: {
            ...sftpTestSettings({ username: sftpTestUsers.pull }),
            port: forwarder.port,
            timeoutMs
          },
          work: function downloadAfterBlackhole(session) {
            started = Date.now()
            forwarder.blackholeOpenConnections()
            return session.download({
              folder: sftpContainerFolders.pull,
              filename,
              maxBytes,
              size: oneByte.length
            })
          }
        })

        await expect(download).rejects.toMatchObject({
          code: 'SSCL_TIMEOUT'
        })
        // The download's own timeout, then a disconnect that does not wait
        // for the server. Twice the timeout leaves room for a slow runner
        // while still failing if the disconnect waits for its own timeout.
        expect(started).toEqual(expect.any(Number))
        expect(Date.now() - started).toBeLessThan(timeoutMs * 2)
      } finally {
        await forwarder.close()
      }
    })

    it('rejects a download over the size limit', async () => {
      const filename = uniqueTestFilename(testPrefix)
      await putInFolder({
        direction: pull,
        filename,
        data: Buffer.alloc(maxBytes + 1)
      })

      await expect(
        getFromFolder({ direction: pull, filename, maxBytes })
      ).rejects.toMatchObject({ code: 'SSCL_FILE_TOO_LARGE' })
    })

    it('removes a file, and succeeds when it is already gone', async () => {
      const filename = uniqueTestFilename(testPrefix)
      const folder = sftpContainerFolders.pull
      await putInFolder({ direction: pull, filename, data: oneByte })

      await asUser({
        direction: pull,
        work: async function removeTwice(session) {
          await session.remove({ folder, filename })
          await session.remove({ folder, filename })
        }
      })

      expect(await namesInFolder({ direction: pull })).toEqual([])
    })

    it('rejects a server whose host key does not match the pinned key', async () => {
      await expect(
        asUser({
          direction: push,
          hostKey: generateSshTestKeyPair().public,
          work: (session) => session.list(sftpContainerFolders.push)
        })
      ).rejects.toThrow('Host denied (verification failed)')
    })

    it('connects through an HTTP CONNECT proxy when one is configured', async () => {
      const proxy = await startConnectProxy()
      const { host, port } = sftpTestConnection()
      try {
        await asUser({
          direction: push,
          proxyUrl: proxy.url,
          work: (session) => session.list(sftpContainerFolders.push)
        })

        expect(proxy.targets).toEqual([`${host}:${port}`])
      } finally {
        await proxy.close()
      }
    })
  }
)

describe(
  'SSCL client over SFTP against the local SFTP server',
  { timeout: sftpTestTimeoutMs },
  () => {
    let keys
    let transport
    let client

    beforeAll(async () => {
      keys = await generatePgpTestKeys()
      transport = createSftpTransport({
        connection: sftpTestConnection(),
        pushUser: sftpTestUsers.push,
        pushFolder: sftpContainerFolders.push,
        pullUser: sftpTestUsers.pull,
        pullFolder: sftpContainerFolders.pull
      })
      client = createSsclClient({
        transport,
        keys: nrfPgpKeysFor(keys),
        limits: ssclTestLimits
      })
    })

    beforeEach(async () => {
      await clearSftpTestFolders()
    }, sftpTestHookTimeoutMs)

    it('pushes a file SSCL can decrypt and verify as signed by NRF', async () => {
      const filename = uniqueTestFilename(nrfTestPrefix)

      await client.pushFile({ filename, data: Buffer.from('to SSCL') })

      const pushed = await getFromFolder({
        direction: push,
        filename,
        maxBytes: ssclTestLimits.maxFileBytes
      })
      const data = await decryptAndVerify({
        data: pushed,
        decryptionKey: keys.ssclEncryption.privateKey,
        passphrase: keys.ssclEncryption.passphrase,
        verificationKey: keys.nrf.publicKey,
        maxDecompressedBytes: ssclTestLimits.maxFileBytes
      })
      expect(data.toString()).toBe('to SSCL')
      expect(await client.listPushFolder()).toEqual([
        expect.objectContaining({ name: filename })
      ])
    })

    it('pulls a file from SSCL, stores it, then removes it from the pull folder', async () => {
      const filename = uniqueTestFilename(ssclTestPrefix)
      const fromSscl = await sentBySscl({ text: fromSsclText, pgp: keys })
      await putInFolder({ direction: pull, filename, data: fromSscl })
      const { stored, onFile } = collectPulledFiles()

      const result = await client.pullFiles({ onFile })

      expect(result).toEqual({
        files: [
          {
            filename,
            size: fromSscl.length,
            status: 'received',
            sha256: expect.any(String),
            decryptedSize: fromSsclText.length
          }
        ],
        notProcessed: 0
      })
      expect(stored.map((file) => file.data.toString())).toEqual([fromSsclText])
      expect(await namesInFolder({ direction: pull })).toEqual([])
    })

    it('counts a file removed between listing and download as gone', async () => {
      const filename = uniqueTestFilename(ssclTestPrefix)
      await putInFolder({
        direction: pull,
        filename,
        data: await sentBySscl({ text: fromSsclText, pgp: keys })
      })

      const restorePullSession = runBeforeEachDownload({
        transport,
        beforeDownload: ({ session, filename: downloading }) =>
          session.remove(downloading)
      })
      try {
        const { files } = await client.pullFiles(collectPulledFiles())

        expect(files).toEqual([
          expect.objectContaining({ filename, status: 'gone' })
        ])
      } finally {
        restorePullSession()
      }
    })

    it('leaves a file that was replaced while it was being stored', async () => {
      const filename = uniqueTestFilename(ssclTestPrefix)
      await putInFolder({
        direction: pull,
        filename,
        data: await sentBySscl({ text: firstText, pgp: keys })
      })
      const replacement = await sentBySscl({
        text: 'the replacement, longer',
        pgp: keys
      })

      const { files } = await client.pullFiles({
        onFile: async function replaceWhileStoring() {
          await transport.withPullSession((session) => session.remove(filename))
          await putInFolder({ direction: pull, filename, data: replacement })
        }
      })

      expect(files).toEqual([
        expect.objectContaining({ filename, status: 'replaced' })
      ])
      const left = await getFromFolder({
        direction: pull,
        filename,
        maxBytes: ssclTestLimits.maxFileBytes
      })
      expect(left).toEqual(replacement)
    })

    it('leaves a file it could not store in the pull folder', async () => {
      const filename = uniqueTestFilename(ssclTestPrefix)
      await putInFolder({
        direction: pull,
        filename,
        data: await sentBySscl({ text: fromSsclText, pgp: keys })
      })

      const { files } = await client.pullFiles({
        onFile: () => Promise.reject(new Error('database down'))
      })

      expect(files).toEqual([
        expect.objectContaining({ filename, status: 'not-stored' })
      ])
      expect(await namesInFolder({ direction: pull })).toEqual([filename])
    })

    it('leaves a pulled file that fails verification in the pull folder', async () => {
      await putInFolder({
        direction: pull,
        filename: notPgpFilename,
        data: Buffer.from('plain')
      })

      const { files } = await client.pullFiles(collectPulledFiles())

      expect(files).toEqual([
        expect.objectContaining({
          filename: notPgpFilename,
          status: 'unverified'
        })
      ])
      expect(await namesInFolder({ direction: pull })).toEqual([notPgpFilename])
    })
  }
)

describe(
  'SSCL client configured for MOVEit, against the local SFTP server',
  { timeout: sftpTestTimeoutMs },
  () => {
    const original = config.get('sscl')
    let keys

    beforeAll(async () => {
      keys = await generatePgpTestKeys()
      loadSftpTestServerConfig({ keys })
      resetSsclClient()
      await clearSftpTestFolders()
    }, sftpTestHookTimeoutMs)

    afterAll(() => {
      config.load({ sscl: original })
      resetSsclClient()
    })

    it('pushes and pulls files using the base64 keys from config', async () => {
      const fromSsclFilename = uniqueTestFilename(ssclTestPrefix)
      const toSsclFilename = uniqueTestFilename(nrfTestPrefix)
      await putInFolder({
        direction: pull,
        filename: fromSsclFilename,
        data: await sentBySscl({ text: fromSsclText, pgp: keys })
      })
      const client = await getSsclClient()

      await client.pushFile({ filename: toSsclFilename, data: oneByte })
      const pushed = await client.listPushFolder()
      const { files } = await client.pullFiles(collectPulledFiles())

      expect(pushed.map((file) => file.name)).toEqual([toSsclFilename])
      expect(files).toEqual([
        expect.objectContaining({
          filename: fromSsclFilename,
          status: 'received'
        })
      ])
      expect(await namesInFolder({ direction: pull })).toEqual([])
    })
  }
)
