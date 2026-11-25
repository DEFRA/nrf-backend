import ssh2 from 'ssh2'

import { ssclTestInvoiceFilename } from './fixtures/sscl.js'
import {
  sftpTestFolders,
  startSftpTestTransport
} from './sftp-test-transport.js'

const { STATUS_CODE } = ssh2.utils.sftp
const replyFilename = 'SSCL_1.pgp'
const data = Buffer.from('hello')

describe('SFTP test transport', () => {
  it('names the push and pull folders as SSCL does', () => {
    expect(sftpTestFolders).toEqual({ push: '/NRLIn', pull: '/NRLOut' })
  })

  describe('startSftpTestTransport', () => {
    let server
    let transport

    afterEach(async () => {
      await server.close()
    })

    it('starts a transport that pushes into the push folder of its server', async () => {
      ;({ server, transport } = await startSftpTestTransport())

      await transport.pushFile({ filename: ssclTestInvoiceFilename, data })

      expect(server.namesIn('/NRLIn')).toEqual([ssclTestInvoiceFilename])
      expect(server.namesIn('/NRLOut')).toEqual([])
    })

    it('starts a transport that pulls from the pull folder of its server', async () => {
      ;({ server, transport } = await startSftpTestTransport())
      server.putFile({ folder: '/NRLOut', filename: replyFilename, data })

      const listed = await transport.withPullSession((session) =>
        session.list()
      )

      expect(listed.map((file) => file.name)).toEqual([replyFilename])
    })

    it('starts the server with the given fault', async () => {
      ;({ server, transport } = await startSftpTestTransport({
        fault: ({ operation }) =>
          operation === 'opendir'
            ? { status: STATUS_CODE.PERMISSION_DENIED }
            : undefined
      }))

      await expect(transport.listPushFolder()).rejects.toMatchObject({
        code: STATUS_CODE.PERMISSION_DENIED
      })
    })

    it('gives up on a stalled server after the given time limit', async () => {
      ;({ server, transport } = await startSftpTestTransport({
        timeoutMs: 100,
        fault: ({ operation }) =>
          operation === 'opendir' ? { stall: true } : undefined
      }))

      await expect(transport.listPushFolder()).rejects.toMatchObject({
        code: 'SSCL_TIMEOUT'
      })
    })
  })
})
