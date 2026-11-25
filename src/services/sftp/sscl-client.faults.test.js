import ssh2 from 'ssh2'

import { createSsclClient } from './sscl-client.js'
import { sentBySscl } from '../../test-utils/fake-sscl-test-helpers.js'
import {
  ssclTestInvoiceFilename,
  ssclTestInvoiceText
} from '../../test-utils/fixtures/sscl.js'
import { generatePgpTestKeys } from '../../test-utils/pgp-test-keys.js'
import {
  sftpTestFolders as folders,
  startSftpTestTransport
} from '../../test-utils/sftp-test-transport.js'
import {
  collectPulledFiles,
  pulledStatuses,
  ssclTestLimits
} from '../../test-utils/sscl-test-helpers.js'

const { STATUS_CODE } = ssh2.utils.sftp
const names = ['SSCL_1.pgp', 'SSCL_2.pgp']

describe('SSCL client against a faulty SFTP server', { timeout: 20000 }, () => {
  let pgp
  let server
  let client

  beforeAll(async () => {
    pgp = await generatePgpTestKeys()
  })

  beforeEach(async () => {
    const sftp = await startSftpTestTransport()
    server = sftp.server
    client = createSsclClient({
      transport: sftp.transport,
      keys: {
        nrfPrivateKey: pgp.nrf.privateKey,
        nrfPassphrase: pgp.nrf.passphrase,
        ssclEncryptionPublicKey: pgp.ssclEncryption.publicKey,
        ssclSigningPublicKey: pgp.ssclSigning.publicKey
      },
      limits: ssclTestLimits
    })
    for (const filename of names) {
      server.putFile({
        folder: folders.pull,
        filename,
        data: await sentBySscl({ text: filename, pgp })
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
    expect(server.namesIn(folders.pull)).toEqual([names[0]])
  })

  it('refuses to push under a name that is already in the push folder', async () => {
    server.putFile({
      folder: folders.push,
      filename: ssclTestInvoiceFilename,
      data: Buffer.from('already there')
    })

    await expect(
      client.pushFile({
        filename: ssclTestInvoiceFilename,
        data: Buffer.from(ssclTestInvoiceText)
      })
    ).rejects.toMatchObject({ code: 'SSCL_FILE_EXISTS' })

    expect(server.namesIn(folders.push)).toEqual([ssclTestInvoiceFilename])
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
