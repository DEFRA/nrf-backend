import net from 'node:net'

import { startEchoServer } from './echo-server.js'
import {
  exchangeOverTcp,
  waitUntil,
  watchNetConnect
} from './net-test-helpers.js'

describe('exchangeOverTcp', () => {
  let echo
  let closer

  beforeAll(async () => {
    echo = await startEchoServer()
    closer = net.createServer((socket) => socket.resume().end('bye'))
    await new Promise((resolve) => closer.listen(0, '127.0.0.1', resolve))
  })

  afterAll(async () => {
    await new Promise((resolve) => echo.close(resolve))
    await new Promise((resolve) => closer.close(resolve))
  })

  it('returns what came back and says the server closed the connection', async () => {
    const result = await exchangeOverTcp({
      port: closer.address().port,
      text: 'hello'
    })

    expect(result).toEqual({ received: 'bye', closed: true })
  })

  it('stops as soon as until says enough has come back', async () => {
    const result = await exchangeOverTcp({
      port: echo.address().port,
      text: 'hello',
      until: (soFar) => soFar === 'hello'
    })

    expect(result).toEqual({ received: 'hello', closed: false })
  })

  it('gives up after waitMs when the connection stays open', async () => {
    const result = await exchangeOverTcp({
      port: echo.address().port,
      text: 'hello',
      until: (soFar) => soFar === 'never sent',
      waitMs: 50
    })

    expect(result).toEqual({ received: 'hello', closed: false })
  })
})

describe('watchNetConnect', () => {
  it('records the sockets opened and how, until restored', async () => {
    const echo = await startEchoServer()
    const { port } = echo.address()
    const original = net.connect
    const watch = watchNetConnect()

    const socket = net.connect(port, '127.0.0.1')
    socket.destroy()
    const seen = { sockets: watch.sockets(), calls: watch.calls() }
    watch.restore()
    await new Promise((resolve) => echo.close(resolve))

    expect(seen.sockets).toEqual([socket])
    expect(seen.calls).toEqual([[port, '127.0.0.1']])
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
