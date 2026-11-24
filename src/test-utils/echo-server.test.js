import { startEchoServer } from './echo-server.js'
import { exchangeOverTcp } from './net-test-helpers.js'

describe('startEchoServer', () => {
  it('sends back what it receives', async () => {
    const server = await startEchoServer()

    const { received } = await exchangeOverTcp({
      port: server.address().port,
      text: 'ping',
      until: (soFar) => soFar === 'ping'
    })
    await new Promise((resolve) => server.close(resolve))

    expect(received).toBe('ping')
  })
})
