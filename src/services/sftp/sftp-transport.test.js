import {
  fakeSsclReplyTime,
  ssclTestInvoiceFilename,
  ssclTestReplyFilename as replyFilename
} from '../../test-utils/fixtures/sscl.js'
import {
  sftpTestFolders as folders,
  startSftpTestTransport
} from '../../test-utils/sftp-test-transport.js'

const data = Buffer.from('hello')
const modifyTime = fakeSsclReplyTime.getTime()

describe('SFTP transport', { timeout: 15000 }, () => {
  let server
  let transport

  beforeEach(async () => {
    ;({ server, transport } = await startSftpTestTransport())
    server.putFile({
      folder: folders.pull,
      filename: replyFilename,
      data,
      modifyTime
    })
  })

  afterEach(async () => {
    await server.close()
  })

  it('pushes a file into the push folder', async () => {
    await transport.pushFile({ filename: ssclTestInvoiceFilename, data })

    expect(server.namesIn(folders.push)).toEqual([ssclTestInvoiceFilename])
    expect(server.namesIn(folders.pull)).toEqual([replyFilename])
  })

  it('refuses to push over a file already in the push folder', async () => {
    const existing = Buffer.from('already there')
    server.putFile({
      folder: folders.push,
      filename: ssclTestInvoiceFilename,
      data: existing
    })

    await expect(
      transport.pushFile({ filename: ssclTestInvoiceFilename, data })
    ).rejects.toMatchObject({ code: 'SSCL_FILE_EXISTS' })

    expect(
      server.files.get(`${folders.push}/${ssclTestInvoiceFilename}`).data
    ).toEqual(existing)
  })

  it('lists the files in the push folder', async () => {
    server.putFile({
      folder: folders.push,
      filename: ssclTestInvoiceFilename,
      data,
      modifyTime
    })

    expect(await transport.listPushFolder()).toEqual([
      { name: ssclTestInvoiceFilename, size: 5, modifyTime }
    ])
  })

  it('lists, stats and downloads a file in the pull folder', async () => {
    const found = await transport.withPullSession(async (session) => ({
      listed: await session.list(),
      stat: await session.stat(replyFilename),
      downloaded: await session.download({
        filename: replyFilename,
        maxBytes: 100,
        size: 5
      })
    }))

    const file = { name: replyFilename, size: 5, modifyTime }
    expect(found).toEqual({ listed: [file], stat: file, downloaded: data })
  })

  it('removes a file from the pull folder', async () => {
    await transport.withPullSession((session) => session.remove(replyFilename))

    expect(server.namesIn(folders.pull)).toEqual([])
  })

  it('does all the work of a pull session over one connection', async () => {
    const openConnections = await transport.withPullSession(async (session) => {
      await session.list()
      await session.stat(replyFilename)
      return server.openConnections()
    })

    expect(openConnections).toBe(1)
  })
})
