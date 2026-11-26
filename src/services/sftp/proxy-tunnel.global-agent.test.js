import { bootstrap } from 'global-agent'

import { openProxyTunnel } from './proxy-tunnel.js'
import { startConnectProxy } from '../../test-utils/connect-proxy.js'
import { startEchoServer } from '../../test-utils/echo-server.js'

// Its own file: global-agent patches node:http for the whole test worker, as
// setupProxy does for the whole backend when HTTP_PROXY is set.
describe('openProxyTunnel with global-agent running', () => {
  let proxy
  let echoServer

  beforeAll(async () => {
    proxy = await startConnectProxy()
    echoServer = await startEchoServer()
    bootstrap()
    global.GLOBAL_AGENT.HTTP_PROXY = proxy.url
  })

  afterAll(async () => {
    global.GLOBAL_AGENT.HTTP_PROXY = undefined
    await proxy.close()
    await new Promise((resolve) => echoServer.close(resolve))
  })

  it('still asks the proxy for a tunnel to the target', async () => {
    const { port } = echoServer.address()

    const socket = await openProxyTunnel({
      proxyUrl: proxy.url,
      host: '127.0.0.1',
      port,
      timeoutMs: 2000
    })
    socket.write('ping')
    const reply = await new Promise((resolve) => socket.once('data', resolve))
    socket.destroy()

    expect(reply.toString()).toBe('ping')
    expect(proxy.targets).toEqual([`127.0.0.1:${port}`])
  })
})
