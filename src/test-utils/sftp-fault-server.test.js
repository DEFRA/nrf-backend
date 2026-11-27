import net from 'node:net'
import { promisify } from 'node:util'
import ssh2 from 'ssh2'
import SftpClient from 'ssh2-sftp-client'

import { waitUntil } from './net-test-helpers.js'
import { startSftpFaultServer } from './sftp-fault-server.js'

const { STATUS_CODE } = ssh2.utils.sftp
const folder = '/in'
const filename = 'a.txt'
const otherFilename = 'b.txt'
const remotePath = `${folder}/${filename}`
const otherRemotePath = `${folder}/${otherFilename}`
const neverIssuedHandle = Buffer.from('ffffffff', 'hex')

describe('startSftpFaultServer', () => {
  let server
  let client

  beforeEach(async () => {
    server = await startSftpFaultServer({ folders: [folder] })
    const { host, port, username, privateKey } = server.settings()
    // As the fault server does: without this each test is some 300 ms slower
    // on Linux.
    const sock = net.connect(port, host).setNoDelay(true)
    client = new SftpClient()
    await client.connect({ sock, username, privateKey })
  })

  afterEach(async () => {
    await client.end()
    await server.close()
  })

  /**
   * One request on the open connection through ssh2's own SFTP client, for
   * requests ssh2-sftp-client has no call for.
   * @param {string} operation a method of ssh2's SFTPWrapper
   * @param {...any} args
   */
  const rawRequest = (operation, ...args) =>
    promisify(client.sftp[operation].bind(client.sftp))(...args)

  it('records the username of each login it accepts', () => {
    expect(server.logins()).toEqual([server.settings().username])
  })

  it('uploads, lists, stats, downloads, renames and removes files as a real server would', async () => {
    await client.put(Buffer.from('hello'), remotePath)
    const listed = await client.list(folder)
    const stat = await client.stat(remotePath)
    const data = await client.get(remotePath)
    await client.rename(remotePath, otherRemotePath)
    const renamed = server.namesIn(folder)
    await client.delete(otherRemotePath)

    expect(listed).toMatchObject([{ name: filename, size: 5, type: '-' }])
    expect(stat).toMatchObject({ size: 5, isFile: true })
    expect(data.toString()).toBe('hello')
    expect(renamed).toEqual([otherFilename])
    expect(server.namesIn(folder)).toEqual([])
  })

  it('fails a download of a missing file with SFTP no such file', async () => {
    await expect(client.get(remotePath)).rejects.toMatchObject({
      code: STATUS_CODE.NO_SUCH_FILE
    })
  })

  it('refuses a rename onto an existing file, as OpenSSH does', async () => {
    server.putFile({ folder, filename, data: Buffer.from('first') })
    server.putFile({
      folder,
      filename: otherFilename,
      data: Buffer.from('second')
    })

    await expect(
      client.rename(otherRemotePath, remotePath)
    ).rejects.toMatchObject({ code: STATUS_CODE.FAILURE })
    expect(server.files.get(remotePath).data.toString()).toBe('first')
  })

  it.each([
    ['read', [neverIssuedHandle, Buffer.alloc(8), 0, 8, 0]],
    ['write', [neverIssuedHandle, Buffer.from('x'), 0, 1, 0]],
    ['readdir', [neverIssuedHandle]]
  ])(
    'answers failure to a %s on a handle it never issued',
    async (operation, args) => {
      await expect(rawRequest(operation, ...args)).rejects.toMatchObject({
        code: STATUS_CODE.FAILURE
      })
    }
  )

  it('answers failure to a read on a handle that has been closed', async () => {
    server.putFile({ folder, filename, data: Buffer.from('x') })
    const handle = await rawRequest('open', remotePath, 'r')
    await rawRequest('close', handle)

    await expect(
      rawRequest('read', handle, Buffer.alloc(8), 0, 8, 0)
    ).rejects.toMatchObject({ code: STATUS_CODE.FAILURE })
  })

  it('answers a request with the status code the fault hook chooses', async () => {
    server.putFile({ folder, filename, data: Buffer.from('x') })
    server.setFault(({ operation }) =>
      operation === 'remove' ? { status: STATUS_CODE.FAILURE } : undefined
    )

    await expect(client.delete(remotePath)).rejects.toMatchObject({
      code: STATUS_CODE.FAILURE
    })
    expect(server.namesIn(folder)).toEqual([filename])
  })

  it('tells the fault hook which operation is asked for and on which path', async () => {
    server.putFile({ folder, filename, data: Buffer.from('x') })
    const requests = []
    server.setFault((request) => {
      requests.push(request)
      return undefined
    })

    await client.get(remotePath)

    expect(requests).toContainEqual({ operation: 'open', path: remotePath })
    expect(requests).toContainEqual({ operation: 'read', path: remotePath })
  })

  it('never answers a stalled request, and still answers the next one', async () => {
    server.putFile({ folder, filename, data: Buffer.from('x') })
    server.setFault(({ operation }) =>
      operation === 'read' ? { stall: true } : undefined
    )
    const handle = await rawRequest('open', remotePath, 'r')
    let readAnswered = false
    const markAnswered = () => (readAnswered = true)
    rawRequest('read', handle, Buffer.alloc(8), 0, 8, 0).then(
      markAnswered,
      markAnswered
    )

    // The server takes requests in order, so by the time it answers the stat
    // it has already dealt with the read.
    const stat = await rawRequest('stat', remotePath)

    expect(stat.size).toBe(1)
    expect(readAnswered).toBe(false)
  })

  it('drops the connection when the fault hook says close', async () => {
    server.setFault(({ operation }) =>
      operation === 'opendir' ? { close: true } : undefined
    )

    await expect(client.list(folder)).rejects.toThrow()
    const dropped = await waitUntil({
      check: () => server.openConnections() === 0
    })
    expect(dropped).toBe(true)
  })
})
