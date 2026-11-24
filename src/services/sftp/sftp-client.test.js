import net from 'node:net'
import SftpClient from 'ssh2-sftp-client'

import {
  disconnectLimitMs,
  minBytesPerSecond,
  transferTimeoutMs,
  withSftpSession
} from './sftp-client.js'
import { ssclErrorCodes } from '../../common/helpers/sscl/sscl-errors.js'
import { startEchoServer } from '../../test-utils/echo-server.js'
import { ssclTestInvoiceFilename as filename } from '../../test-utils/fixtures/sscl.js'
import { generateSshTestKeyPair } from '../../test-utils/ssh-test-keys.js'

vi.mock('ssh2-sftp-client')
const mockLogger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }))
vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const hostKey = generateSshTestKeyPair()
const clientKey = generateSshTestKeyPair()
const timeoutMs = 5000
// ssh2-sftp-client is mocked, so the socket only has to connect somewhere
const echoServer = await startEchoServer()
const settings = {
  host: '127.0.0.1',
  port: echoServer.address().port,
  username: 'CDDEFTNRLIn',
  privateKey: clientKey.private,
  hostKey: hostKey.public,
  timeoutMs
}
const folder = '/Interfaces/DEF/Test/NRLIn'
const remotePath = `${folder}/${filename}`
const partialPath = expect.stringMatching(
  new RegExp(`^${remotePath.replaceAll('.', '\\.')}\\.[0-9a-f]{8}\\.part$`)
)
const data = Buffer.from('hello')
const never = () => new Promise(() => {})

const sftpInstance = () => vi.mocked(SftpClient).mock.instances.at(-1)
const firstInstance = () => vi.mocked(SftpClient).mock.instances[0]
const connectOptions = () => vi.mocked(firstInstance().connect).mock.calls[0][0]
const inSession = (work) => withSftpSession({ settings, work })

/**
 * Starts a session and says when its work has begun, so a test using fake
 * timers advances them only once the real socket has connected.
 */
const startSession = (work) => {
  let begin
  const begun = new Promise((resolve) => (begin = resolve))
  const result = inSession((session) => {
    begin(connectOptions().sock)
    return work(session)
  })
  result.catch(() => {})
  return { result, begun }
}

/**
 * Runs a test body with fake timeouts.
 */
const withFakeTimers = async (run) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    return await run()
  } finally {
    vi.useRealTimers()
  }
}

afterAll(async () => {
  await new Promise((resolve) => echoServer.close(resolve))
})

describe('withSftpSession', () => {
  beforeEach(() => {
    SftpClient.prototype.list.mockResolvedValue([
      { name: 'b.pgp', type: '-', size: 10, modifyTime: 2 },
      { name: 'a.pgp', type: '-', size: 5, modifyTime: 1 },
      { name: 'sub', type: 'd', size: 0, modifyTime: 0 }
    ])
    SftpClient.prototype.get.mockResolvedValue(Buffer.from('content'))
  })

  it('connects as the given user with the private key and pinned host key', async () => {
    await inSession((session) => session.list(folder))

    const options = connectOptions()
    expect(options).toMatchObject({
      host: '127.0.0.1',
      port: settings.port,
      username: 'CDDEFTNRLIn',
      privateKey: clientKey.private,
      readyTimeout: timeoutMs
    })
    expect(options.sock).toBeInstanceOf(net.Socket)
    expect(options.sock.destroyed).toBe(true)
    const hostBlob = Buffer.from(hostKey.public.split(' ')[1], 'base64')
    const otherBlob = Buffer.from(clientKey.public.split(' ')[1], 'base64')
    expect(options.hostVerifier(hostBlob)).toBe(true)
    expect(options.hostVerifier(otherBlob)).toBe(false)
  })

  it('runs every operation over one connection, then disconnects', async () => {
    await inSession(async (session) => {
      await session.list(folder)
      await session.download({ folder, filename: 'a.pgp', maxBytes: 100 })
      await session.remove({ folder, filename: 'a.pgp' })
    })

    expect(SftpClient).toHaveBeenCalledTimes(1)
    expect(sftpInstance().connect).toHaveBeenCalledTimes(1)
    expect(sftpInstance().end).toHaveBeenCalledTimes(1)
  })

  it('lists only the files in a folder, in name order', async () => {
    const files = await inSession((session) => session.list(folder))

    expect(sftpInstance().list).toHaveBeenCalledWith(folder)
    expect(files).toEqual([
      { name: 'a.pgp', size: 5, modifyTime: 1 },
      { name: 'b.pgp', size: 10, modifyTime: 2 }
    ])
  })

  it('uploads to a partial file unique to this upload, then renames it to the final name', async () => {
    await inSession((session) => session.upload({ folder, filename, data }))
    await inSession((session) => session.upload({ folder, filename, data }))

    const [first, second] = vi
      .mocked(SftpClient)
      .mock.instances.map((instance) => instance.put.mock.calls[0][1])
    expect(firstInstance().exists).toHaveBeenCalledWith(remotePath)
    expect(firstInstance().put).toHaveBeenCalledWith(data, partialPath)
    expect(firstInstance().rename).toHaveBeenCalledWith(first, remotePath)
    expect(second).not.toBe(first)
  })

  it('reports the file as already there when the rename fails because another upload got the name first', async () => {
    SftpClient.prototype.exists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('-')
    SftpClient.prototype.rename.mockRejectedValue(
      Object.assign(new Error('Failure'), { code: 4 })
    )

    await expect(
      inSession((session) => session.upload({ folder, filename, data }))
    ).rejects.toMatchObject({ code: ssclErrorCodes.fileExists })
    expect(sftpInstance().delete).toHaveBeenCalledWith(partialPath, true)
  })

  it('refuses to upload over a file that is already there', async () => {
    SftpClient.prototype.exists.mockResolvedValue('-')

    await expect(
      inSession((session) => session.upload({ folder, filename, data }))
    ).rejects.toMatchObject({ code: ssclErrorCodes.fileExists })
    expect(sftpInstance().put).not.toHaveBeenCalled()
  })

  it.each([
    ['the upload', 'put'],
    ['the rename', 'rename']
  ])('removes the partial file when %s fails', async (_step, method) => {
    SftpClient.prototype[method].mockRejectedValue(new Error('connection lost'))

    await expect(
      inSession((session) => session.upload({ folder, filename, data }))
    ).rejects.toThrow('connection lost')
    expect(sftpInstance().delete).toHaveBeenCalledWith(partialPath, true)
    expect(SftpClient).toHaveBeenCalledTimes(1)
  })

  it('downloads at most one byte over the limit', async () => {
    const downloaded = await inSession((session) =>
      session.download({ folder, filename, maxBytes: 100 })
    )

    expect(sftpInstance().get).toHaveBeenCalledWith(remotePath, undefined, {
      readStreamOptions: { end: 100 }
    })
    expect(downloaded.toString()).toBe('content')
  })

  it('rejects a download over the limit', async () => {
    await expect(
      inSession((session) =>
        session.download({ folder, filename, maxBytes: 6 })
      )
    ).rejects.toMatchObject({ code: ssclErrorCodes.fileTooLarge })
  })

  it('removes a file, succeeding if it is already gone', async () => {
    await inSession((session) => session.remove({ folder, filename }))

    expect(sftpInstance().delete).toHaveBeenCalledWith(remotePath, true)
  })

  it.each([
    ['a file', '-', { name: filename, size: 5, modifyTime: 1 }],
    ['nothing', false, undefined]
  ])('stats %s', async (_case, exists, expected) => {
    SftpClient.prototype.exists.mockResolvedValue(exists)
    SftpClient.prototype.stat.mockResolvedValue({ size: 5, modifyTime: 1 })

    const stat = await inSession((session) =>
      session.stat({ folder, filename })
    )

    expect(stat).toEqual(expected)
  })

  it.each([['../etc/passwd'], ['a/b.pgp'], [''], ['..']])(
    'refuses an unsafe filename %j',
    async (unsafe) => {
      await expect(
        inSession((session) => session.remove({ folder, filename: unsafe }))
      ).rejects.toMatchObject({
        code: ssclErrorCodes.invalidFilename,
        message: `Invalid SFTP filename ${JSON.stringify(unsafe)}`
      })
      expect(sftpInstance().delete).not.toHaveBeenCalled()
    }
  )

  it.each([
    [
      'an upload',
      (session) => session.upload({ folder, filename: '../x', data })
    ],
    [
      'a download',
      (session) => session.download({ folder, filename: '../x', maxBytes: 100 })
    ]
  ])(
    'refuses %s under an unsafe filename, before asking the server',
    async (_operation, work) => {
      await expect(inSession(work)).rejects.toMatchObject({
        code: ssclErrorCodes.invalidFilename
      })

      expect(sftpInstance().exists).not.toHaveBeenCalled()
      expect(sftpInstance().put).not.toHaveBeenCalled()
      expect(sftpInstance().get).not.toHaveBeenCalled()
    }
  )

  it('gives up on an operation that takes longer than the time limit and closes the connection', async () => {
    await withFakeTimers(async () => {
      SftpClient.prototype.list.mockImplementation(never)
      const { result, begun } = startSession((session) => session.list(folder))
      const outcome = expect(result).rejects.toMatchObject({
        code: ssclErrorCodes.timeout,
        message: `SFTP list timed out after ${timeoutMs}ms`
      })
      const socket = await begun

      await vi.advanceTimersByTimeAsync(timeoutMs)

      await outcome
      expect(socket.destroyed).toBe(true)
      expect(firstInstance().end).not.toHaveBeenCalled()
    })
  })

  it('fails every operation after a timeout at once, without trying it', async () => {
    await withFakeTimers(async () => {
      SftpClient.prototype.list.mockImplementation(never)
      const { result, begun } = startSession(async (session) => {
        await session.list(folder).catch(() => {})
        return session.remove({ folder, filename })
      })
      const failed = expect(result).rejects.toThrow(
        'SFTP delete not tried: the connection is closed'
      )
      await begun

      await vi.advanceTimersByTimeAsync(timeoutMs)

      await failed
      expect(firstInstance().delete).not.toHaveBeenCalled()
    })
  })

  it('gives an upload or download time for its size on top of the time limit', async () => {
    const size = 10 * minBytesPerSecond
    const limit = transferTimeoutMs({ timeoutMs, bytes: size })
    expect(limit).toBe(timeoutMs + 10000)

    await withFakeTimers(async () => {
      SftpClient.prototype.get.mockImplementation(never)
      const { result: download, begun } = startSession((session) =>
        session.download({ folder, filename, maxBytes: size, size })
      )
      let settled = false
      download.finally(() => (settled = true)).catch(() => {})
      await begun

      await vi.advanceTimersByTimeAsync(timeoutMs)
      expect(settled).toBe(false)
      const outcome = expect(download).rejects.toThrow(
        `SFTP download timed out after ${limit}ms`
      )
      await vi.advanceTimersByTimeAsync(limit - timeoutMs)
      await outcome
    })
  })

  it('removes a partial upload cut off by a timeout from a fresh session', async () => {
    await withFakeTimers(async () => {
      SftpClient.prototype.put.mockImplementationOnce(never)
      const { result, begun } = startSession((session) =>
        session.upload({ folder, filename, data })
      )
      const outcome = expect(result).rejects.toMatchObject({
        code: ssclErrorCodes.timeout
      })
      await begun

      await vi.advanceTimersByTimeAsync(
        transferTimeoutMs({ timeoutMs, bytes: data.length })
      )

      await outcome
      const partial = firstInstance().put.mock.calls[0][1]
      expect(SftpClient).toHaveBeenCalledTimes(2)
      expect(firstInstance().delete).not.toHaveBeenCalled()
      expect(sftpInstance().delete).toHaveBeenCalledWith(partial, true)
    })
  })

  it('opens no cleanup session when the upload failed before writing anything', async () => {
    SftpClient.prototype.exists.mockRejectedValue(new Error('ECONNRESET'))

    await expect(
      inSession((session) => session.upload({ folder, filename, data }))
    ).rejects.toThrow('ECONNRESET')
    expect(SftpClient).toHaveBeenCalledTimes(1)
  })

  it('removes the partial from a fresh session when removing it in this session fails', async () => {
    SftpClient.prototype.rename.mockRejectedValue(new Error('refused'))
    SftpClient.prototype.delete
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValue(true)

    await expect(
      inSession((session) => session.upload({ folder, filename, data }))
    ).rejects.toThrow('refused')

    const partial = firstInstance().put.mock.calls[0][1]
    expect(SftpClient).toHaveBeenCalledTimes(2)
    expect(sftpInstance().delete).toHaveBeenCalledWith(partial, true)
  })

  it('logs, not throws, when the partial upload cannot be removed afterwards', async () => {
    await withFakeTimers(async () => {
      SftpClient.prototype.put.mockImplementationOnce(never)
      SftpClient.prototype.delete.mockRejectedValue(new Error('refused'))
      const { result, begun } = startSession((session) =>
        session.upload({ folder, filename, data })
      )
      const outcome = expect(result).rejects.toMatchObject({
        code: ssclErrorCodes.timeout
      })
      await begun

      await vi.advanceTimersByTimeAsync(
        transferTimeoutMs({ timeoutMs, bytes: data.length })
      )

      await outcome
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'refused' }),
        'SFTP could not remove a partial upload'
      )
    })
  })

  it('closes the connection when a clean disconnect takes too long', async () => {
    await withFakeTimers(async () => {
      SftpClient.prototype.end.mockImplementation(never)
      const { result, begun } = startSession(async () => {})
      const socket = await begun

      await vi.advanceTimersByTimeAsync(disconnectLimitMs)

      await result
      expect(socket.destroyed).toBe(true)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ code: ssclErrorCodes.timeout }),
        'SFTP disconnect failed'
      )
    })
  })

  it('fails with a timeout when the server does not accept the connection in time', async () => {
    await withFakeTimers(async () => {
      const connectSpy = vi
        .spyOn(net, 'connect')
        .mockImplementationOnce(() => new net.Socket())
      try {
        const session = inSession((s) => s.list(folder))
        const outcome = expect(session).rejects.toMatchObject({
          code: ssclErrorCodes.timeout,
          message: `SFTP connect to 127.0.0.1:${settings.port} timed out after ${timeoutMs}ms`
        })

        await vi.advanceTimersByTimeAsync(timeoutMs)

        await outcome
        expect(firstInstance().connect).not.toHaveBeenCalled()
      } finally {
        connectSpy.mockRestore()
      }
    })
  })

  it('disconnects and rethrows without logging when the connection fails', async () => {
    SftpClient.prototype.connect.mockRejectedValue(new Error('auth failed'))

    await expect(inSession((session) => session.list(folder))).rejects.toThrow(
      'auth failed'
    )
    expect(sftpInstance().end).toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('logs a failed disconnect', async () => {
    const error = new Error('already closed')
    SftpClient.prototype.end.mockRejectedValue(error)

    await inSession((session) => session.list(folder))

    expect(mockLogger.error).toHaveBeenCalledWith(
      error,
      'SFTP disconnect failed'
    )
  })

  it('logs the connection attempt and outcome without secrets', async () => {
    await inSession((session) => session.list(folder))

    const context = {
      sftp: { host: '127.0.0.1', port: settings.port, username: 'CDDEFTNRLIn' }
    }
    expect(mockLogger.info).toHaveBeenCalledWith(context, 'SFTP connecting')
    expect(mockLogger.info).toHaveBeenCalledWith(context, 'SFTP connected')
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain(
      clientKey.private
    )
  })
})
