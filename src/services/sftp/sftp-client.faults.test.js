import ssh2 from 'ssh2'

import { withSftpSession } from './sftp-client.js'
import { ssclErrorCodes } from '../../common/helpers/sscl/sscl-errors.js'
import { waitUntil } from '../../test-utils/net-test-helpers.js'
import { startSftpFaultServer } from '../../test-utils/sftp-fault-server.js'
import { startTcpForwarder } from '../../test-utils/tcp-forwarder.js'

const { STATUS_CODE } = ssh2.utils.sftp
const folder = '/in'
const filename = 'a.txt'
const timeoutMs = 500
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

    it('closes the connection as soon as a stalled download times out', async () => {
      server.putFile({ folder, filename, data })
      server.setFault(({ operation }) =>
        operation === 'read' ? { stall: true } : undefined
      )

      // Checked inside the session, before its own disconnect could close it
      const outcome = await inSession(async (session) => {
        const started = Date.now()
        const error = await session
          .download({ folder, filename, maxBytes: 100, size: data.length })
          .catch((caught) => caught)
        return {
          error,
          elapsedMs: Date.now() - started,
          closed: await waitUntil({
            check: () => server.openConnections() === 0,
            withinMs: 500
          })
        }
      })

      expect(outcome.error).toMatchObject({ code: ssclErrorCodes.timeout })
      expect(outcome.elapsedMs).toBeLessThan(timeoutMs + 200)
      expect(outcome.closed).toBe(true)
    })

    it('removes the partial file of a stalled upload once the upload has failed', async () => {
      server.setFault(({ operation }) =>
        operation === 'write' ? { stall: true } : undefined
      )

      await expect(
        inSession((session) => session.upload({ folder, filename, data }))
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
