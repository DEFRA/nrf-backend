import net from 'node:net'

import { startEchoServer } from './echo-server.js'
import { exchangeOverTcp as exchange, waitUntil } from './net-test-helpers.js'
import { startTcpForwarder } from './tcp-forwarder.js'

describe('startTcpForwarder', () => {
  let echo
  let forwarder

  beforeEach(async () => {
    echo = await startEchoServer()
    forwarder = await startTcpForwarder({
      targetHost: '127.0.0.1',
      targetPort: echo.address().port
    })
  })

  afterEach(async () => {
    await forwarder.close()
    await new Promise((resolve) => echo.close(resolve))
  })

  it('forwards both ways when no fault is set', async () => {
    const { received } = await exchange({
      port: forwarder.port,
      text: 'hello',
      until: (soFar) => soFar === 'hello'
    })

    expect(received).toBe('hello')
    expect(forwarder.droppedBytes()).toBe(0)
  })

  it('closes the connection once the bytes pass the limit when told to cut', async () => {
    forwarder.setFault({ afterBytes: 3, action: 'cut' })

    const { received, closed } = await exchange({
      port: forwarder.port,
      text: 'hello'
    })

    expect(received).toBe('')
    expect(closed).toBe(true)
  })

  it('closes the connection cleanly once the bytes pass the limit when told to end', async () => {
    forwarder.setFault({ afterBytes: 3, action: 'end' })

    const { received, closed } = await exchange({
      port: forwarder.port,
      text: 'hello'
    })

    expect(received).toBe('')
    expect(closed).toBe(true)
  })

  it('stops forwarding but keeps the connection open when told to blackhole', async () => {
    forwarder.setFault({ afterBytes: 3, action: 'blackhole' })

    const { received, closed } = await exchange({
      port: forwarder.port,
      text: 'hello',
      until: () => forwarder.droppedBytes() === 'hello'.length
    })

    expect(received).toBe('')
    expect(closed).toBe(false)
  })

  it('counts the bytes coming back when the fault is downstream', async () => {
    forwarder.setFault({
      afterBytes: 3,
      action: 'cut',
      direction: 'downstream'
    })

    const { closed } = await exchange({ port: forwarder.port, text: 'hello' })

    expect(closed).toBe(true)
  })

  it('stops forwarding on connections already open when told to', async () => {
    const socket = net.connect(forwarder.port, '127.0.0.1')
    let received = ''
    socket.on('data', (chunk) => (received += chunk.toString()))
    socket.write('one')
    await waitUntil({ check: () => received === 'one' })

    forwarder.blackholeOpenConnections()
    socket.write('two')
    const dropped = await waitUntil({
      check: () => forwarder.droppedBytes() === 'two'.length
    })

    expect(dropped).toBe(true)
    expect(received).toBe('one')
    expect(socket.destroyed).toBe(false)
    socket.destroy()
  })

  it('applies a fault to the next connection only, unless told otherwise', async () => {
    forwarder.setFault({ afterBytes: 3, action: 'cut' })

    await exchange({ port: forwarder.port, text: 'hello' })
    const { received } = await exchange({
      port: forwarder.port,
      text: 'again',
      until: (soFar) => soFar === 'again'
    })

    expect(received).toBe('again')
  })
})
