import net from 'node:net'

/**
 * Sends text over TCP and collects what comes back. Stops when the socket
 * closes, when until() says enough has happened, or when waitMs passes.
 * @param {{ port: number, text: string, until?: (received: string) => boolean, waitMs?: number }} params
 *   until is given what has come back so far; waitMs is a backstop, so pass
 *   until whenever the connection is expected to stay open
 * @returns {Promise<{ received: string, closed: boolean }>}
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
    const finish = (closed) => {
      clearInterval(poll)
      clearTimeout(backstop)
      resolve({ received, closed })
      socket.destroy()
    }
    const poll = setInterval(function checkUntil() {
      if (until(received)) {
        finish(false)
      }
    }, 10)
    const backstop = setTimeout(() => finish(false), waitMs)
    socket.on('data', (chunk) => {
      received += chunk.toString()
    })
    socket.on('error', () => {})
    socket.on('close', () => finish(true))
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
