import net from 'node:net'

import { startEchoServer } from './echo-server.js'
import { exchangeOverTcp as exchange, waitUntil } from './net-test-helpers.js'
import { startTcpForwarder } from './tcp-forwarder.js'

const text = 'hello'
const first = 'one'
const second = 'two'
const again = 'again'

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
    const result = await exchange({
      port: forwarder.port,
      text,
      until: (soFar) => soFar === text
    })

    expect(result).toEqual({ received: text, stoppedBy: 'until' })
    expect(forwarder.droppedBytes()).toBe(0)
  })

  it('closes the connection once the bytes pass the limit when told to cut', async () => {
    forwarder.setFault({ afterBytes: 3, action: 'cut' })

    const result = await exchange({ port: forwarder.port, text })

    expect(result).toEqual({ received: '', stoppedBy: 'close' })
  })

  it('closes the connection cleanly once the bytes pass the limit when told to end', async () => {
    forwarder.setFault({ afterBytes: 3, action: 'end' })

    const result = await exchange({ port: forwarder.port, text })

    expect(result).toEqual({ received: '', stoppedBy: 'close' })
  })

  it('stops forwarding but keeps the connection open when told to blackhole', async () => {
    forwarder.setFault({ afterBytes: 3, action: 'blackhole' })

    const result = await exchange({
      port: forwarder.port,
      text,
      until: () => forwarder.droppedBytes() === text.length
    })

    expect(result).toEqual({ received: '', stoppedBy: 'until' })
  })

  it('counts the bytes coming back when the fault is downstream', async () => {
    forwarder.setFault({
      afterBytes: 3,
      action: 'cut',
      direction: 'downstream'
    })

    const { stoppedBy } = await exchange({ port: forwarder.port, text })

    expect(stoppedBy).toBe('close')
  })

  it('stops forwarding on connections already open when told to', async () => {
    const socket = net.connect(forwarder.port, '127.0.0.1')
    let received = ''
    socket.on('data', (chunk) => (received += chunk.toString()))
    socket.write(first)
    await waitUntil({ check: () => received === first })

    forwarder.blackholeOpenConnections()
    socket.write(second)
    const dropped = await waitUntil({
      check: () => forwarder.droppedBytes() === second.length
    })

    expect(dropped).toBe(true)
    expect(received).toBe(first)
    expect(socket.destroyed).toBe(false)
    socket.destroy()
  })

  it('applies a fault to the next connection only, unless told otherwise', async () => {
    forwarder.setFault({ afterBytes: 3, action: 'cut' })

    await exchange({ port: forwarder.port, text })
    const result = await exchange({
      port: forwarder.port,
      text: again,
      until: (soFar) => soFar === again
    })

    expect(result).toEqual({ received: again, stoppedBy: 'until' })
  })
})
