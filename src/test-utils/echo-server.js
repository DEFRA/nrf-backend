import net from 'node:net'

/**
 * Starts a TCP server on a random local port that echoes back what it receives.
 */
export const startEchoServer = async () => {
  const server = net.createServer(function echo(socket) {
    // Without a listener, a client that resets its connection would throw an
    // uncaught exception in the test run.
    socket.on('error', () => {})
    socket.pipe(socket)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}
