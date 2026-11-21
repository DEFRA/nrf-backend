import { randomUUID } from 'node:crypto'

import { config } from '../../config.js'
import { createSsclClient } from './sscl-client.js'
import { createSftpTransport } from './sftp-transport.js'
import { getSsclClient, resetSsclClient } from './get-sscl-client.js'
import {
  decryptAndVerify,
  encryptAndSign
} from '../../common/helpers/sscl/pgp.js'
import {
  isNoSuchFileError,
  ssclErrorCodes
} from '../../common/helpers/sscl/sscl-errors.js'
import { generatePgpTestKeys } from '../../test-utils/pgp-test-keys.js'
import { startConnectProxy } from '../../test-utils/connect-proxy.js'
import { startTcpForwarder } from '../../test-utils/tcp-forwarder.js'
import { withSftpSession } from './sftp-client.js'
import {
  collectPulledFiles,
  ssclTestLimits
} from '../../test-utils/sscl-test-helpers.js'
import {
  asSftpTestUser as asUser,
  clearSftpTestFolders,
  loadSftpTestServerConfig,
  namesInSftpTestFolder as namesInFolder,
  putInSftpTestFolder as putInFolder,
  sftpTestFolders,
  sftpTestHookTimeoutMs,
  sftpTestSettings,
  sftpTestUsers
} from '../../test-utils/sftp-test-server.js'
import { generateSshTestKeyPair } from '../../test-utils/ssh-test-keys.js'

// One file, so these run in sequence against the shared SFTP container folders.

const uniqueName = () => `test-${randomUUID()}.txt`
const maxBytes = 1024
const fromSsclText = 'from SSCL'

describe(
  'SFTP session against the local SFTP server',
  { timeout: 20000 },
  () => {
    beforeEach(async () => {
      await clearSftpTestFolders()
    }, sftpTestHookTimeoutMs)

    it('fails a download of a missing file with the no-such-file error the pull relies on', async () => {
      const download = asUser({
        direction: 'pull',
        work: (session) =>
          session.download({
            folder: sftpTestFolders.pull,
            filename: uniqueName(),
            maxBytes
          })
      })

      await expect(download).rejects.toSatisfy(isNoSuchFileError)
    })

    it('uploads a file, lists it, stats it and downloads it again in one session', async () => {
      const filename = uniqueName()
      const data = Buffer.from('hello SSCL')
      const folder = sftpTestFolders.push

      const result = await asUser({
        direction: 'push',
        work: async (session) => {
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
      expect(result.downloaded.toString()).toBe('hello SSCL')
    })

    it('refuses to upload over an existing file and leaves no partial file', async () => {
      const filename = uniqueName()
      await putInFolder({
        direction: 'push',
        filename,
        data: Buffer.from('first')
      })

      await expect(
        putInFolder({
          direction: 'push',
          filename,
          data: Buffer.from('second')
        })
      ).rejects.toMatchObject({ code: ssclErrorCodes.fileExists })
      expect(await namesInFolder({ direction: 'push' })).toEqual([filename])
    })

    it('lets only one of two uploads of the same name at once take the name, and leaves no partial file', async () => {
      const filename = uniqueName()
      const folder = sftpTestFolders.push
      const texts = ['first', 'second']

      // In one session, so both existence checks are answered before either
      // upload is renamed and the server's refusal to rename decides.
      const outcomes = await asUser({
        direction: 'push',
        work: (session) =>
          Promise.allSettled(
            texts.map((text) =>
              session.upload({ folder, filename, data: Buffer.from(text) })
            )
          )
      })

      const winner = texts[outcomes.findIndex((o) => o.status === 'fulfilled')]
      expect(outcomes.map((o) => o.status).sort()).toEqual([
        'fulfilled',
        'rejected'
      ])
      expect(
        outcomes.find((o) => o.status === 'rejected').reason
      ).toMatchObject({ code: ssclErrorCodes.fileExists })
      expect(await namesInFolder({ direction: 'push' })).toEqual([filename])
      const stored = await asUser({
        direction: 'push',
        work: (session) => session.download({ folder, filename, maxBytes })
      })
      expect(stored.toString()).toBe(winner)
    })

    it('gives up on a download when the network stops answering, without waiting for a clean disconnect', async () => {
      const filename = uniqueName()
      await putInFolder({
        direction: 'pull',
        filename,
        data: Buffer.from('x')
      })
      const forwarder = await startTcpForwarder({
        targetHost: '127.0.0.1',
        targetPort: 2223
      })
      // Long enough for the SSH handshake while other test files run
      const timeoutMs = 3000
      let started
      try {
        const download = withSftpSession({
          settings: {
            ...sftpTestSettings({ username: sftpTestUsers.pull }),
            port: forwarder.port,
            timeoutMs
          },
          work: (session) => {
            started = Date.now()
            forwarder.blackholeOpenConnections()
            return session.download({
              folder: sftpTestFolders.pull,
              filename,
              maxBytes,
              size: 1
            })
          }
        })

        await expect(download).rejects.toMatchObject({
          code: ssclErrorCodes.timeout
        })
        // The download's own timeout, then a disconnect that does not wait
        expect(Date.now() - started).toBeLessThan(timeoutMs + 2000)
      } finally {
        await forwarder.close()
      }
    })

    it('rejects a download over the size limit', async () => {
      const filename = uniqueName()
      await putInFolder({
        direction: 'pull',
        filename,
        data: Buffer.alloc(maxBytes + 1)
      })

      await expect(
        asUser({
          direction: 'pull',
          work: (session) =>
            session.download({
              folder: sftpTestFolders.pull,
              filename,
              maxBytes
            })
        })
      ).rejects.toMatchObject({ code: ssclErrorCodes.fileTooLarge })
    })

    it('removes a file, and succeeds when it is already gone', async () => {
      const filename = uniqueName()
      const folder = sftpTestFolders.pull
      await putInFolder({ direction: 'pull', filename, data: Buffer.from('x') })

      await asUser({
        direction: 'pull',
        work: async (session) => {
          await session.remove({ folder, filename })
          await session.remove({ folder, filename })
        }
      })

      expect(await namesInFolder({ direction: 'pull' })).toEqual([])
    })

    it('rejects a server whose host key does not match the pinned key', async () => {
      await expect(
        asUser({
          direction: 'push',
          hostKey: generateSshTestKeyPair().public,
          work: (session) => session.list(sftpTestFolders.push)
        })
      ).rejects.toThrow('Host denied (verification failed)')
    })

    it('connects through an HTTP CONNECT proxy when one is configured', async () => {
      const proxy = await startConnectProxy()
      try {
        await asUser({
          direction: 'push',
          proxyUrl: proxy.url,
          work: (session) => session.list(sftpTestFolders.push)
        })

        expect(proxy.targets).toEqual(['127.0.0.1:2223'])
      } finally {
        await proxy.close()
      }
    })
  }
)

const { username: _unused, ...connection } = sftpTestSettings({ username: '' })
const transport = createSftpTransport({
  connection,
  pushUser: sftpTestUsers.push,
  pushFolder: sftpTestFolders.push,
  pullUser: sftpTestUsers.pull,
  pullFolder: sftpTestFolders.pull
})

describe(
  'SSCL client over SFTP against the local SFTP server',
  { timeout: 20000 },
  () => {
    let keys
    let client

    beforeAll(async () => {
      keys = await generatePgpTestKeys()
      client = createSsclClient({
        transport,
        keys: {
          nrfPrivateKey: keys.nrf.privateKey,
          nrfPassphrase: keys.nrf.passphrase,
          ssclEncryptionPublicKey: keys.ssclEncryption.publicKey,
          ssclSigningPublicKey: keys.ssclSigning.publicKey
        },
        limits: ssclTestLimits
      })
    })

    beforeEach(async () => {
      await clearSftpTestFolders()
    }, sftpTestHookTimeoutMs)

    const signedBySscl = (text) =>
      encryptAndSign({
        data: Buffer.from(text),
        encryptionKey: keys.nrf.publicKey,
        signingKey: keys.ssclSigning.privateKey,
        passphrase: keys.ssclSigning.passphrase
      })

    it('pushes a file SSCL can decrypt and verify as signed by NRF', async () => {
      const filename = `NRF_TEST_${randomUUID()}.pgp`

      await client.pushFile({ filename, data: Buffer.from('to SSCL') })

      const pushed = await asUser({
        direction: 'push',
        work: (session) =>
          session.download({
            folder: sftpTestFolders.push,
            filename,
            maxBytes: ssclTestLimits.maxFileBytes
          })
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
      const filename = `SSCL_TEST_${randomUUID()}.pgp`
      const fromSscl = await signedBySscl(fromSsclText)
      await putInFolder({ direction: 'pull', filename, data: fromSscl })
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
      expect(await namesInFolder({ direction: 'pull' })).toEqual([])
    })

    /**
     * Runs a pull with each download preceded by something done to the file.
     */
    const pullWithBeforeDownload = async ({ beforeDownload, onFile }) => {
      const { withPullSession } = transport
      transport.withPullSession = (work) =>
        withPullSession((session) =>
          work({
            ...session,
            download: async (file) => {
              await beforeDownload(file.filename)
              return session.download(file)
            }
          })
        )
      try {
        return await client.pullFiles({
          onFile: onFile ?? collectPulledFiles().onFile
        })
      } finally {
        transport.withPullSession = withPullSession
      }
    }

    const removeFromPullFolder = (filename) =>
      asUser({
        direction: 'pull',
        work: (session) =>
          session.remove({ folder: sftpTestFolders.pull, filename })
      })

    it('counts a file removed between listing and download as gone', async () => {
      const filename = `SSCL_TEST_${randomUUID()}.pgp`
      await putInFolder({
        direction: 'pull',
        filename,
        data: await signedBySscl(fromSsclText)
      })

      const { files } = await pullWithBeforeDownload({
        beforeDownload: removeFromPullFolder
      })

      expect(files).toEqual([
        expect.objectContaining({ filename, status: 'gone' })
      ])
    })

    it('leaves a file that was replaced while it was being stored', async () => {
      const filename = `SSCL_TEST_${randomUUID()}.pgp`
      await putInFolder({
        direction: 'pull',
        filename,
        data: await signedBySscl('first')
      })
      const replacement = await signedBySscl('the replacement, longer')

      const { files } = await client.pullFiles({
        onFile: async () => {
          await removeFromPullFolder(filename)
          await putInFolder({ direction: 'pull', filename, data: replacement })
        }
      })

      expect(files).toEqual([
        expect.objectContaining({ filename, status: 'changed' })
      ])
      const left = await asUser({
        direction: 'pull',
        work: (session) =>
          session.download({
            folder: sftpTestFolders.pull,
            filename,
            maxBytes: ssclTestLimits.maxFileBytes
          })
      })
      expect(left).toEqual(replacement)
    })

    it('leaves a file it could not store in the pull folder', async () => {
      const filename = `SSCL_TEST_${randomUUID()}.pgp`
      await putInFolder({
        direction: 'pull',
        filename,
        data: await signedBySscl(fromSsclText)
      })

      const { files } = await client.pullFiles({
        onFile: () => Promise.reject(new Error('database down'))
      })

      expect(files).toEqual([
        expect.objectContaining({ filename, status: 'not-stored' })
      ])
      expect(await namesInFolder({ direction: 'pull' })).toEqual([filename])
    })

    it('leaves a pulled file that fails verification in the pull folder', async () => {
      await putInFolder({
        direction: 'pull',
        filename: 'NOT_PGP.txt',
        data: Buffer.from('plain')
      })

      const { files } = await client.pullFiles(collectPulledFiles())

      expect(files).toEqual([
        expect.objectContaining({
          filename: 'NOT_PGP.txt',
          status: 'unverified'
        })
      ])
      expect(await namesInFolder({ direction: 'pull' })).toEqual([
        'NOT_PGP.txt'
      ])
    })
  }
)

describe(
  'SSCL client configured for MOVEit, against the local SFTP server',
  { timeout: 20000 },
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
      const fromSscl = await encryptAndSign({
        data: Buffer.from(fromSsclText),
        encryptionKey: keys.nrf.publicKey,
        signingKey: keys.ssclSigning.privateKey,
        passphrase: keys.ssclSigning.passphrase
      })
      await putInFolder({
        direction: 'pull',
        filename: 'SSCL_TEST.pgp',
        data: fromSscl
      })
      const client = await getSsclClient()

      await client.pushFile({
        filename: 'NRF_TEST.pgp',
        data: Buffer.from('x')
      })
      const pushed = await client.listPushFolder()
      const { files } = await client.pullFiles(collectPulledFiles())

      expect(pushed.map((file) => file.name)).toEqual(['NRF_TEST.pgp'])
      expect(files).toEqual([
        expect.objectContaining({
          filename: 'SSCL_TEST.pgp',
          status: 'received'
        })
      ])
    })
  }
)
