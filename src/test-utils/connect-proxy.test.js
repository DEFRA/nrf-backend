import net from 'node:net'

import { connectProxyTargets, startConnectProxy } from './connect-proxy.js'
import { startEchoServer } from './echo-server.js'
import { exchangeOverTcp, waitUntil } from './net-test-helpers.js'

const established = 'HTTP/1.1 200 Connection Established\r\n\r\n'
const forbidden = 'HTTP/1.1 403 Forbidden\r\n\r\n'
const sshPort = 22

/** @param {string} target host:port */
const connectRequest = (target) =>
  `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`

describe('startConnectProxy', () => {
  let proxy
  let echo

  beforeEach(async () => {
    proxy = await startConnectProxy()
    echo = await startEchoServer()
  })

  afterEach(async () => {
    await proxy.close()
    await new Promise((resolve) => echo.close(resolve))
  })

  const proxyPort = () => Number(new URL(proxy.url).port)

  /**
   * Asks the proxy for a tunnel and collects what it sends back.
   * @param {{ host: string, port?: number, thenSend?: string, until?: (received: string) => boolean }} params
   */
  const askForTunnel = ({ host, port = sshPort, thenSend = '', until }) =>
    exchangeOverTcp({
      port: proxyPort(),
      text: `${connectRequest(`${host}:${port}`)}${thenSend}`,
      until
    })

  it('tunnels to the target, sending on what the client sent with its request', async () => {
    const { port } = echo.address()
    const expected = `${established}ping`

    const result = await askForTunnel({
      host: '127.0.0.1',
      port,
      thenSend: 'ping',
      until: (soFar) => soFar === expected
    })

    expect(result).toEqual({ received: expected, stoppedBy: 'until' })
  })

  it('records each target it is asked for', async () => {
    await askForTunnel({ host: connectProxyTargets.blocked })
    await askForTunnel({ host: connectProxyTargets.closesEarly, port: 2222 })

    expect(proxy.targets).toEqual([
      `${connectProxyTargets.blocked}:${sshPort}`,
      `${connectProxyTargets.closesEarly}:2222`
    ])
  })

  it('refuses the blocked target with a 403 and closes', async () => {
    const result = await askForTunnel({ host: connectProxyTargets.blocked })

    expect(result).toEqual({ received: forbidden, stoppedBy: 'close' })
  })

  it('refuses a target with no port with a 400 and closes', async () => {
    const result = await exchangeOverTcp({
      port: proxyPort(),
      text: connectRequest('127.0.0.1')
    })

    expect(result).toEqual({
      received: 'HTTP/1.1 400 Bad Request\r\n\r\n',
      stoppedBy: 'close'
    })
  })

  it('closes without answering for the closes-early target', async () => {
    const result = await askForTunnel({ host: connectProxyTargets.closesEarly })

    expect(result).toEqual({ received: '', stoppedBy: 'close' })
  })

  it('takes the request and never answers for the silent target', async () => {
    const result = await askForTunnel({
      host: connectProxyTargets.silent,
      until: () => proxy.targets.length === 1
    })

    expect(result).toEqual({ received: '', stoppedBy: 'until' })
  })

  it('answers with something other than HTTP for the not-HTTP target', async () => {
    const notHttp = 'SSH-2.0-not-a-proxy\r\n\r\n'

    const result = await askForTunnel({
      host: connectProxyTargets.notHttp,
      until: (soFar) => soFar === notHttp
    })

    expect(result).toEqual({ received: notHttp, stoppedBy: 'until' })
  })

  it('sends headers that never end for the endless-headers target', async () => {
    const paddingBytes = 20 * 1024

    const { received, stoppedBy } = await askForTunnel({
      host: connectProxyTargets.endlessHeaders,
      until: (soFar) => soFar.length > paddingBytes
    })

    expect(received).toMatch(/^HTTP\/1\.1 200 OK\r\n/)
    expect(received).not.toContain('\r\n\r\n')
    expect(stoppedBy).toBe('until')
  })

  it.each(['splitResponse', 'bannerWithResponse'])(
    'answers 200 and then sends a server banner for the %s target',
    async (target) => {
      const expected = `${established}SSH-2.0-banner-in-the-same-packet\r\n`

      const result = await askForTunnel({
        host: connectProxyTargets[target],
        until: (soFar) => soFar === expected
      })

      expect(result).toEqual({ received: expected, stoppedBy: 'until' })
    }
  )

  it('answers 405 to a request that is not a CONNECT', async () => {
    const { received } = await exchangeOverTcp({
      port: proxyPort(),
      text: 'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'
    })

    expect(received).toMatch(/^HTTP\/1\.1 405 /)
  })

  // Without the proxy's error listener the reset is an uncaught exception,
  // which fails the test run.
  it('carries on when a client resets its connection part way through an answer', async () => {
    const socket = net.connect(proxyPort(), '127.0.0.1')
    socket.on('error', () => {})
    socket.write(
      connectRequest(`${connectProxyTargets.splitResponse}:${sshPort}`)
    )
    await new Promise((resolve) => socket.once('data', resolve))

    socket.resetAndDestroy()
    const released = await waitUntil({ check: () => proxy.openSockets() === 0 })
    const next = await askForTunnel({ host: connectProxyTargets.blocked })

    expect(released).toBe(true)
    expect(next).toEqual({ received: forbidden, stoppedBy: 'close' })
  })
})
