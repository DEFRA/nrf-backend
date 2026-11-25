import { openProxyTunnel, parseConnectResponse } from './proxy-tunnel.js'
import {
  bannerSentWithResponse,
  connectProxyTargets,
  startConnectProxy
} from '../../test-utils/connect-proxy.js'
import { startEchoServer } from '../../test-utils/echo-server.js'
import { watchNetConnect } from '../../test-utils/net-test-helpers.js'

const timeoutMs = 2000

describe('openProxyTunnel', () => {
  let proxy
  let echoServer

  beforeAll(async () => {
    proxy = await startConnectProxy()
    echoServer = await startEchoServer()
  })

  afterAll(async () => {
    await proxy.close()
    await new Promise((resolve) => echoServer.close(resolve))
  })

  const tunnelTo = ({ host, port = 22, proxyUrl = proxy.url }) =>
    openProxyTunnel({ proxyUrl, host, port, timeoutMs })

  const firstData = (socket) =>
    new Promise((resolve) => socket.once('data', resolve))

  it('opens a tunnel to the target host and port through the proxy', async () => {
    const { port } = echoServer.address()

    const socket = await tunnelTo({ host: '127.0.0.1', port })
    socket.write('ping')
    const reply = await firstData(socket)
    socket.destroy()

    expect(reply.toString()).toBe('ping')
    expect(proxy.targets).toContain(`127.0.0.1:${port}`)
  })

  it('hands over a socket whose errors do not stop the process before the caller listens for them', async () => {
    const { port } = echoServer.address()

    const socket = await tunnelTo({ host: '127.0.0.1', port })

    expect(() => socket.emit('error', new Error('reset'))).not.toThrow()
    socket.destroy()
  })

  it('keeps server bytes that arrive in the same packet as the proxy response', async () => {
    const socket = await tunnelTo({
      host: connectProxyTargets.bannerWithResponse
    })
    const banner = await firstData(socket)
    socket.destroy()

    expect(banner.toString()).toBe(bannerSentWithResponse)
  })

  it('waits for a proxy response that arrives in more than one packet', async () => {
    const socket = await tunnelTo({ host: connectProxyTargets.splitResponse })
    const banner = await firstData(socket)
    socket.destroy()

    expect(banner.toString()).toBe(bannerSentWithResponse)
  })

  it('rejects straight away when the proxy closes without answering', async () => {
    await expect(
      tunnelTo({ host: connectProxyTargets.closesEarly })
    ).rejects.toThrow('Proxy closed the connection before opening a tunnel')
  })

  it('rejects when the proxy answers with something other than HTTP', async () => {
    await expect(
      tunnelTo({ host: connectProxyTargets.notHttp })
    ).rejects.toThrow('Proxy sent an unexpected response: SSH-2.0-not-a-proxy')
  })

  it('rejects when the proxy sends headers that never end', async () => {
    await expect(
      tunnelTo({ host: connectProxyTargets.endlessHeaders })
    ).rejects.toThrow('Proxy response headers are too large')
  })

  it('rejects and closes the socket when the proxy refuses the connection', async () => {
    const watched = watchNetConnect()
    try {
      await expect(
        tunnelTo({ host: connectProxyTargets.blocked })
      ).rejects.toThrow('Proxy refused tunnel (403)')

      expect(watched.sockets()).toHaveLength(1)
      expect(watched.sockets()[0].destroyed).toBe(true)
    } finally {
      watched.restore()
    }
  })

  it('refuses a proxy URL with credentials, which CONNECT would not send', async () => {
    const watched = watchNetConnect()
    try {
      await expect(
        tunnelTo({
          host: '127.0.0.1',
          proxyUrl: 'http://user:secret@127.0.0.1:1'
        })
      ).rejects.toThrow('Proxy URLs with credentials are not supported')
      expect(watched.calls()).toEqual([])
    } finally {
      watched.restore()
    }
  })

  it.each([
    ['http://proxy.invalid', 80],
    ['https://proxy.invalid', 443],
    ['http://proxy.invalid:3128', 3128]
  ])('connects to %s on port %i', async (proxyUrl, port) => {
    const watched = watchNetConnect()
    try {
      await expect(tunnelTo({ host: 'x', proxyUrl })).rejects.toThrow()

      expect(watched.calls()[0]).toEqual([port, 'proxy.invalid'])
    } finally {
      watched.restore()
    }
  })

  it('gives up and closes the socket when the proxy never answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const watched = watchNetConnect()
    try {
      const tunnel = tunnelTo({ host: connectProxyTargets.silent })
      const outcome = expect(tunnel).rejects.toThrow(
        `Proxy did not open a tunnel within ${timeoutMs}ms`
      )
      await vi.advanceTimersByTimeAsync(timeoutMs)
      await outcome
      expect(watched.sockets()[0].destroyed).toBe(true)
    } finally {
      watched.restore()
      vi.useRealTimers()
    }
  })

  it('rejects when the proxy cannot be reached', async () => {
    await expect(
      tunnelTo({ host: '127.0.0.1', proxyUrl: 'http://127.0.0.1:1' })
    ).rejects.toThrow(/ECONNREFUSED/)
  })
})

describe('parseConnectResponse', () => {
  it('waits until the whole header block has arrived', () => {
    expect(
      parseConnectResponse(Buffer.from('HTTP/1.1 200 OK\r\nVia: squid\r\n'))
    ).toBeUndefined()
  })

  it('reads the status code and keeps the bytes after the headers', () => {
    const response = parseConnectResponse(
      Buffer.from('HTTP/1.1 200 Connection established\r\n\r\nSSH-2.0-x')
    )

    expect(response.statusCode).toBe(200)
    expect(response.head.toString()).toBe('SSH-2.0-x')
  })

  it.each([
    ['a refusal', 'HTTP/1.0 403 Forbidden', 403],
    ['a status line that is not HTTP', 'SSH-2.0-server', Number.NaN]
  ])('reads %s', (_case, statusLine, statusCode) => {
    const response = parseConnectResponse(Buffer.from(`${statusLine}\r\n\r\n`))

    expect(response).toMatchObject({ statusCode, statusLine })
  })
})
