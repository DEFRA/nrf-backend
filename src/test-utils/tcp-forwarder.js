import net from 'node:net'

/**
 * What happens to a connection once a number of bytes have passed in one
 * direction: `blackhole` stops forwarding anything but keeps both sockets
 * open, as a network that drops packets; `cut` closes both at once; `end`
 * closes the client's side cleanly (a FIN, as a proxy that drops the tunnel)
 * and stops forwarding.
 * @typedef {{ afterBytes: number, action: 'blackhole' | 'cut' | 'end', direction?: 'upstream' | 'downstream', connections?: number }} ForwarderFault
 *   direction defaults to upstream (client to server); the fault applies to
 *   the next `connections` connections (default 1), then later ones are clean
 */

/**
 * Starts a TCP forwarder on a random local port in front of a real server, so
 * a test can drop or stall a real connection part way through.
 * @param {{ targetHost: string, targetPort: number }} params
 */
export async function startTcpForwarder({ targetHost, targetPort }) {
  const sockets = new Set()
  /** @type {Set<{ blackholed: boolean }>} */
  const connections = new Set()
  /** @type {ForwarderFault | undefined} */
  let fault
  let faultyConnectionsLeft = 0

  const track = (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
  }

  const server = net.createServer(function onConnection(client) {
    const upstream = net.connect(targetPort, targetHost)
    track(client)
    track(upstream)
    const connectionFault = faultyConnectionsLeft > 0 ? fault : undefined
    faultyConnectionsLeft = Math.max(0, faultyConnectionsLeft - 1)
    let bytesSeen = 0
    const state = { blackholed: false }
    connections.add(state)
    client.on('close', () => connections.delete(state))

    const applyFault = () => {
      state.blackholed = true
      if (connectionFault.action === 'cut') {
        client.destroy()
        upstream.destroy()
      } else if (connectionFault.action === 'end') {
        client.end()
        upstream.destroy()
      }
    }

    const forward = ({ from, to, direction }) => {
      const faulty =
        connectionFault &&
        (connectionFault.direction ?? 'upstream') === direction
      from.on('data', function forwardChunk(chunk) {
        if (state.blackholed) {
          return
        }
        if (faulty) {
          bytesSeen += chunk.length
          if (bytesSeen > connectionFault.afterBytes) {
            applyFault()
            return
          }
        }
        to.write(chunk)
      })
      from.on('end', () => {
        if (!state.blackholed) {
          to.end()
        }
      })
    }
    forward({ from: client, to: upstream, direction: 'upstream' })
    forward({ from: upstream, to: client, direction: 'downstream' })
    client.on('close', () => upstream.destroy())
    upstream.on('close', () => {
      if (!state.blackholed) {
        client.destroy()
      }
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  return {
    port: server.address().port,
    /** Sockets still open, client and upstream sides together. */
    openSockets: () => sockets.size,
    /** Stops forwarding on every open connection, leaving them open. */
    blackholeOpenConnections() {
      connections.forEach((state) => (state.blackholed = true))
    },
    /**
     * @param {ForwarderFault | undefined} next
     */
    setFault(next) {
      fault = next
      faultyConnectionsLeft = next ? (next.connections ?? 1) : 0
    },
    close: () =>
      new Promise((resolve) => {
        sockets.forEach((socket) => socket.destroy())
        server.close(resolve)
      })
  }
}
