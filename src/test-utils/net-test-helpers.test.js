import net from 'node:net'

import { startEchoServer } from './echo-server.js'
import {
  exchangeOverTcp,
  trackSocket,
  waitUntil,
  watchNetConnect
} from './net-test-helpers.js'

const localhost = '127.0.0.1'
const text = 'hello'

/**
 * Starts a TCP server on a random local port that handles each connection
 * with onConnection.
 * @param {(socket: net.Socket) => void} onConnection
 */
const startServer = async (onConnection) => {
  const server = net.createServer(onConnection)
  await new Promise((resolve) => server.listen(0, localhost, resolve))
  return server
}

/** @param {net.Server} server */
const stopServer = (server) => new Promise((resolve) => server.close(resolve))

describe('exchangeOverTcp', () => {
  let echo
  let closer
  let silent

  beforeAll(async () => {
    echo = await startEchoServer()
    closer = await startServer((socket) => socket.resume().end('bye'))
    silent = await startServer((socket) => socket.resume())
  })

  afterAll(async () => {
    await Promise.all([echo, closer, silent].map(stopServer))
  })

  it('returns what came back and says the server closed the connection', async () => {
    const result = await exchangeOverTcp({
      port: closer.address().port,
      text
    })

    expect(result).toEqual({ received: 'bye', stoppedBy: 'close' })
  })

  it('stops as soon as until says enough has come back', async () => {
    const result = await exchangeOverTcp({
      port: echo.address().port,
      text,
      until: (soFar) => soFar === text
    })

    expect(result).toEqual({ received: text, stoppedBy: 'until' })
  })

  it('gives up after waitMs when nothing ends the exchange', async () => {
    const result = await exchangeOverTcp({
      port: silent.address().port,
      text,
      waitMs: 50
    })

    expect(result).toEqual({ received: '', stoppedBy: 'timeout' })
  })
})

describe('trackSocket', () => {
  it('keeps a socket until it closes, and takes its errors', async () => {
    const echo = await startEchoServer()
    const sockets = new Set()
    const socket = net.connect(echo.address().port, localhost)
    trackSocket({ socket, sockets })
    const tracked = [...sockets]

    socket.destroy(new Error('connection lost'))
    await new Promise((resolve) => socket.once('close', resolve))
    await stopServer(echo)

    expect(tracked).toEqual([socket])
    expect(sockets.size).toBe(0)
  })
})

describe('watchNetConnect', () => {
  it('records the sockets opened and how, until restored', async () => {
    const echo = await startEchoServer()
    const { port } = echo.address()
    const original = net.connect
    const watch = watchNetConnect()

    const socket = net.connect(port, localhost)
    socket.destroy()
    const seen = { sockets: watch.sockets(), calls: watch.calls() }
    watch.restore()
    await stopServer(echo)

    expect(seen.sockets).toEqual([socket])
    expect(seen.calls).toEqual([[port, localhost]])
    expect(net.connect).toBe(original)
  })
})

describe('waitUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says true as soon as the check passes', async () => {
    let ready = false
    setTimeout(() => (ready = true), 100)

    const waiting = waitUntil({ check: () => ready, withinMs: 5000 })
    await vi.advanceTimersByTimeAsync(120)

    await expect(waiting).resolves.toBe(true)
  })

  it('says false when the check has not passed in time', async () => {
    const waiting = waitUntil({ check: () => false, withinMs: 200 })
    await vi.advanceTimersByTimeAsync(220)

    await expect(waiting).resolves.toBe(false)
  })
})
