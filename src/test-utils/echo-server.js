import net from 'node:net'

/**
 * Starts a TCP server on a random local port that echoes back what it receives.
 */
export const startEchoServer = async () => {
  const server = net.createServer((socket) => socket.pipe(socket))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}
