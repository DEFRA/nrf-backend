import net from 'node:net'

/**
 * Sends text over TCP and collects what comes back until the socket closes or
 * waitMs passes.
 * @param {{ port: number, text: string, waitMs?: number }} params
 * @returns {Promise<{ received: string, closed: boolean }>}
 */
export const exchangeOverTcp = ({ port, text, waitMs = 200 }) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    let received = ''
    socket.on('data', (chunk) => {
      received += chunk.toString()
    })
    socket.on('error', () => {})
    socket.on('close', () => resolve({ received, closed: true }))
    socket.on('connect', () => socket.write(text))
    setTimeout(function onWaited() {
      resolve({ received, closed: false })
      socket.destroy()
    }, waitMs)
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
