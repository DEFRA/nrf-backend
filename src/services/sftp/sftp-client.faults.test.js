import ssh2 from 'ssh2'

import { withSftpSession } from './sftp-client.js'
import { ssclErrorCodes } from '../../common/helpers/sscl/sscl-errors.js'
import { startConnectProxy } from '../../test-utils/connect-proxy.js'
import { waitUntil } from '../../test-utils/net-test-helpers.js'
import { startSftpFaultServer } from '../../test-utils/sftp-fault-server.js'
import { generateSshTestKeyPair } from '../../test-utils/ssh-test-keys.js'
import { startTcpForwarder } from '../../test-utils/tcp-forwarder.js'

const { STATUS_CODE } = ssh2.utils.sftp
const folder = '/in'
const filename = 'a.txt'
// Long enough that only a real stall reaches it, however slow the machine.
const timeoutMs = 10000
// For the tests that stall a request on purpose and wait out the time limit.
// It limits the SSH handshake too, so it can't be much shorter.
const stallTimeoutMs = 1000
// How far past the time limit a slow machine may be. Well short of the five
// seconds a clean disconnect is allowed, which a timeout must not wait for.
const slackMs = 1000
const data = Buffer.from('hello')

describe(
  'withSftpSession against a faulty SFTP server',
  { timeout: 15000 },
  () => {
    let server

    beforeEach(async () => {
      server = await startSftpFaultServer({ folders: [folder] })
    })

    afterEach(async () => {
      await server.close()
    })

    const inSession = (work) =>
      withSftpSession({ settings: server.settings({ timeoutMs }), work })

    const inSessionThatStalls = (work) =>
      withSftpSession({
        settings: server.settings({ timeoutMs: stallTimeoutMs }),
        work
      })

    it('refuses a server whose host key does not match the pinned key', async () => {
      const work = vi.fn()

      await expect(
        withSftpSession({
          settings: {
            ...server.settings({ timeoutMs }),
            hostKey: generateSshTestKeyPair().public
          },
          work
        })
      ).rejects.toThrow('Host denied (verification failed)')

      expect(work).not.toHaveBeenCalled()
    })

    it('connects through an HTTP CONNECT proxy when one is configured', async () => {
      const proxy = await startConnectProxy()
      try {
        const settings = {
          ...server.settings({ timeoutMs }),
          proxyUrl: proxy.url
        }

        const files = await withSftpSession({
          settings,
          work: (session) => session.list(folder)
        })

        expect(files).toEqual([])
        expect(proxy.targets).toEqual([`127.0.0.1:${settings.port}`])
      } finally {
        await proxy.close()
      }
    })

    it('closes the connection as soon as a stalled download times out', async () => {
      server.putFile({ folder, filename, data })
      server.setFault(({ operation }) =>
        operation === 'read' ? { stall: true } : undefined
      )

      // Checked inside the session, before its own disconnect could close it
      const outcome = await inSessionThatStalls(async (session) => {
        const started = Date.now()
        const error = await session
          .download({ folder, filename, maxBytes: 100, size: data.length })
          .catch((caught) => caught)
        return {
          error,
          elapsedMs: Date.now() - started,
          closed: await waitUntil({
            check: () => server.openConnections() === 0,
            withinMs: slackMs
          })
        }
      })

      expect(outcome.error).toMatchObject({ code: ssclErrorCodes.timeout })
      expect(outcome.elapsedMs).toBeLessThan(stallTimeoutMs + slackMs)
      expect(outcome.closed).toBe(true)
    })

    it('removes the partial file of a stalled upload once the upload has failed', async () => {
      server.setFault(({ operation }) =>
        operation === 'write' ? { stall: true } : undefined
      )

      await expect(
        inSessionThatStalls((session) =>
          session.upload({ folder, filename, data })
        )
      ).rejects.toMatchObject({ code: ssclErrorCodes.timeout })

      expect(server.namesIn(folder)).toEqual([])
    })

    it('leaves no partial file when the rename is refused', async () => {
      server.setFault(({ operation }) =>
        operation === 'rename'
          ? { status: STATUS_CODE.PERMISSION_DENIED }
          : undefined
      )

      await expect(
        inSession((session) => session.upload({ folder, filename, data }))
      ).rejects.toMatchObject({ code: STATUS_CODE.PERMISSION_DENIED })

      expect(server.namesIn(folder)).toEqual([])
    })

    it('reports the server ending the session mid upload and leaves no partial file', async () => {
      server.setFault(({ operation }) =>
        operation === 'write' ? { close: true } : undefined
      )

      await expect(
        inSession((session) => session.upload({ folder, filename, data }))
      ).rejects.toThrow()

      expect(server.namesIn(folder)).toEqual([])
    })

    it.each([
      ['cut', 'cut'],
      ['closed cleanly', 'end']
    ])(
      'removes the partial file when the network connection is %s mid upload, from a new connection',
      async (_case, action) => {
        const forwarder = await startTcpForwarder({
          targetHost: '127.0.0.1',
          targetPort: server.settings().port
        })
        try {
          // Past the SSH handshake, part way through the 200 KB upload
          forwarder.setFault({ afterBytes: 50 * 1024, action })

          await expect(
            withSftpSession({
              settings: {
                ...server.settings({ timeoutMs }),
                port: forwarder.port
              },
              work: (session) =>
                session.upload({
                  folder,
                  filename,
                  data: Buffer.alloc(200 * 1024)
                })
            })
          ).rejects.toThrow()

          expect(server.namesIn(folder)).toEqual([])
        } finally {
          await forwarder.close()
        }
      }
    )
  }
)
