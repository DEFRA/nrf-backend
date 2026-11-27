import ssh2 from 'ssh2'

import { createSsclClient } from './sscl-client.js'
import {
  buildReply,
  fakeSsclKeysFor,
  fakeSsclReplyFaults
} from '../../test-utils/fake-sscl.js'
import {
  fakeSsclTestMaxFileBytes,
  sentBySscl
} from '../../test-utils/fake-sscl-test-helpers.js'
import {
  fakeSsclReplyTime,
  ssclTestInvoiceFilename,
  ssclTestInvoiceText,
  ssclTestReplyFilename,
  ssclTestSecondReplyFilename
} from '../../test-utils/fixtures/sscl.js'
import { generatePgpTestKeys } from '../../test-utils/pgp-test-keys.js'
import {
  sftpTestFolders as folders,
  startSftpTestTransport
} from '../../test-utils/sftp-test-transport.js'
import {
  collectPulledFiles,
  nrfPgpKeysFor,
  pulledStatuses,
  refuseOn,
  ssclTestLimits
} from '../../test-utils/sscl-test-helpers.js'

const { STATUS_CODE } = ssh2.utils.sftp
const names = [ssclTestReplyFilename, ssclTestSecondReplyFilename]

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
      keys: nrfPgpKeysFor(pgp),
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

  it('carries on to the next file when the server refuses to delete one', async () => {
    refuseOn({
      server,
      operation: 'remove',
      filename: names[0],
      status: STATUS_CODE.FAILURE
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual([
      [names[0], 'not-deleted'],
      [names[1], 'received']
    ])
    expect(server.namesIn(folders.pull)).toEqual([names[0]])
  })

  it('carries on to the next file when the server refuses to open one', async () => {
    refuseOn({
      server,
      operation: 'open',
      filename: names[0],
      status: STATUS_CODE.PERMISSION_DENIED
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual([
      [names[0], 'download-failed'],
      [names[1], 'received']
    ])
    expect(server.namesIn(folders.pull)).toEqual([names[0]])
  })

  it('counts a file that is gone by the time it is opened as gone, and carries on', async () => {
    refuseOn({
      server,
      operation: 'open',
      filename: names[0],
      status: STATUS_CODE.NO_SUCH_FILE
    })

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual([
      [names[0], 'gone'],
      [names[1], 'received']
    ])
  })

  it('leaves a reply with spaces in its name, and carries on', async () => {
    const oddReply = await buildReply({
      about: 'odd',
      time: fakeSsclReplyTime,
      keys: fakeSsclKeysFor(pgp),
      maxFileBytes: fakeSsclTestMaxFileBytes,
      fault: fakeSsclReplyFaults.oddName
    })
    server.putFile({ folder: folders.pull, ...oddReply })

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual(
      expect.arrayContaining([
        [oddReply.filename, 'download-failed'],
        [names[0], 'received'],
        [names[1], 'received']
      ])
    )
    expect(result.files).toHaveLength(3)
    expect(server.namesIn(folders.pull)).toEqual([oddReply.filename])
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
