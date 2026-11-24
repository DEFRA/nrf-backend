import net from 'node:net'

import { startEchoServer } from './echo-server.js'
import { exchangeOverTcp, waitUntil } from './net-test-helpers.js'

const text = 'ping'

describe('startEchoServer', () => {
  let server

  beforeEach(async () => {
    server = await startEchoServer()
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  const echoed = () =>
    exchangeOverTcp({
      port: server.address().port,
      text,
      until: (soFar) => soFar === text
    })

  it('sends back what it receives', async () => {
    expect(await echoed()).toEqual({ received: text, stoppedBy: 'until' })
  })

  // Without the server's error listener the reset is an uncaught exception,
  // which fails the test run.
  it('carries on when a client resets its connection', async () => {
    let serverSideClosed = false
    server.once('connection', (socket) =>
      socket.on('close', () => (serverSideClosed = true))
    )
    const socket = net.connect(server.address().port, '127.0.0.1')
    socket.on('error', () => {})
    await new Promise((resolve) => socket.once('connect', resolve))

    socket.resetAndDestroy()
    await waitUntil({ check: () => serverSideClosed })

    expect(serverSideClosed).toBe(true)
    expect(await echoed()).toEqual({ received: text, stoppedBy: 'until' })
  })
})
