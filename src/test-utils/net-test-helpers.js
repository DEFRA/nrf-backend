import net from 'node:net'

/**
 * Keeps a socket in a set until it closes, and listens for its errors. Node
 * throws an uncaught exception for a socket error nobody listens for, so
 * without this a client that resets its connection would fail the test run.
 * @param {{ socket: net.Socket, sockets: Set<net.Socket> }} params
 */
export const trackSocket = ({ socket, sockets }) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
  socket.on('error', () => {})
}

/**
 * Sends text over TCP and collects what comes back. Stops when the socket
 * closes, when until() says enough has happened, or when waitMs passes, and
 * says which.
 * @param {{ port: number, text: string, until?: (received: string) => boolean, waitMs?: number }} params
 *   until is given what has come back so far; waitMs is a backstop, so pass
 *   until whenever the connection is expected to stay open
 * @returns {Promise<{ received: string, stoppedBy: 'close' | 'until' | 'timeout' }>}
 */
export const exchangeOverTcp = ({
  port,
  text,
  until = () => false,
  waitMs = 2000
}) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    let received = ''
    const stop = (stoppedBy) => {
      clearInterval(poll)
      clearTimeout(backstop)
      resolve({ received, stoppedBy })
      socket.destroy()
    }
    const poll = setInterval(function checkUntil() {
      if (until(received)) {
        stop('until')
      }
    }, 10)
    const backstop = setTimeout(() => stop('timeout'), waitMs)
    socket.on('data', (chunk) => {
      received += chunk.toString()
    })
    socket.on('error', () => {})
    socket.on('close', () => stop('close'))
    socket.on('connect', () => socket.write(text))
  })

/**
 * Spies on net.connect, so a test can see the sockets code opened.
 */
export const watchNetConnect = () => {
  const spy = vi.spyOn(net, 'connect')
  return {
    /** @returns {net.Socket[]} */
    sockets: () => spy.mock.results.map((result) => result.value),
    calls: () => spy.mock.calls,
    restore: () => spy.mockRestore()
  }
}

/**
 * Waits until check() is true or withinMs passes, and says which.
 * @param {{ check: () => boolean, withinMs?: number }} params
 */
export const waitUntil = async ({ check, withinMs = 2000 }) => {
  const end = Date.now() + withinMs
  while (!check() && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return check()
}
