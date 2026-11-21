import ssh2 from 'ssh2'

import { createSsclClient } from './sscl-client.js'
import { createSftpTransport } from './sftp-transport.js'
import { encryptAndSign } from '../../common/helpers/sscl/pgp.js'
import { generatePgpTestKeys } from '../../test-utils/pgp-test-keys.js'
import { startSftpFaultServer } from '../../test-utils/sftp-fault-server.js'
import {
  collectPulledFiles,
  pulledStatuses,
  ssclTestLimits
} from '../../test-utils/sscl-test-helpers.js'

const { STATUS_CODE } = ssh2.utils.sftp
const folders = { push: '/NRLIn', pull: '/NRLOut' }
const names = ['SSCL_1.pgp', 'SSCL_2.pgp']
// Long enough that only a real stall reaches it, however slow the machine.
const timeoutMs = 10000

describe('SSCL pull against a faulty SFTP server', { timeout: 20000 }, () => {
  let keys
  let server
  let client

  beforeAll(async () => {
    keys = await generatePgpTestKeys()
  })

  beforeEach(async () => {
    server = await startSftpFaultServer({
      folders: [folders.push, folders.pull]
    })
    client = createSsclClient({
      transport: createSftpTransport({
        connection: server.settings({ timeoutMs }),
        pushUser: 'push',
        pushFolder: folders.push,
        pullUser: 'pull',
        pullFolder: folders.pull
      }),
      keys: {
        nrfPrivateKey: keys.nrf.privateKey,
        nrfPassphrase: keys.nrf.passphrase,
        ssclEncryptionPublicKey: keys.ssclEncryption.publicKey,
        ssclSigningPublicKey: keys.ssclSigning.publicKey
      },
      limits: ssclTestLimits
    })
    for (const filename of names) {
      server.putFile({
        folder: folders.pull,
        filename,
        data: await encryptAndSign({
          data: Buffer.from(filename),
          encryptionKey: keys.nrf.publicKey,
          signingKey: keys.ssclSigning.privateKey,
          passphrase: keys.ssclSigning.passphrase
        })
      })
    }
  })

  afterEach(async () => {
    await server.close()
  })

  /**
   * Answers one operation on the first file with an SFTP status code.
   */
  const refuseOnFirstFile = ({ operation, status }) =>
    server.setFault((request) =>
      request.operation === operation && request.path.endsWith(names[0])
        ? { status }
        : undefined
    )

  it('carries on to the next file when the server refuses to delete one', async () => {
    refuseOnFirstFile({ operation: 'remove', status: STATUS_CODE.FAILURE })

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual([
      [names[0], 'not-deleted'],
      [names[1], 'received']
    ])
    expect(server.namesIn(folders.pull)).toEqual([names[0]])
  })

  it('carries on to the next file when the server refuses to open one', async () => {
    refuseOnFirstFile({
      operation: 'open',
      status: STATUS_CODE.PERMISSION_DENIED
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual([
      [names[0], 'download-failed'],
      [names[1], 'received']
    ])
  })

  it('stops the pull when the connection drops, leaving the rest for later', async () => {
    server.setFault(({ operation, path }) =>
      operation === 'open' && path.endsWith(names[0])
        ? { close: true }
        : undefined
    )

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual([[names[0], 'download-failed']])
    expect(result.notProcessed).toBe(1)
    expect(server.namesIn(folders.pull)).toEqual(names)
  })
})
