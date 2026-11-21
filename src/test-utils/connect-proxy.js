import http from 'node:http'
import net from 'node:net'

export const connectProxyTargets = {
  blocked: 'blocked.invalid',
  silent: 'silent.invalid',
  bannerWithResponse: 'banner.invalid',
  closesEarly: 'closes.invalid',
  splitResponse: 'split.invalid',
  notHttp: 'not-http.invalid',
  endlessHeaders: 'endless.invalid'
}

export const bannerSentWithResponse = 'SSH-2.0-banner-in-the-same-packet\r\n'

/**
 * Starts a minimal HTTP CONNECT proxy on a random local port, standing in for
 * the CDP squid proxy. Records each CONNECT target so tests can assert on it.
 * Special targets (see connectProxyTargets) make it refuse, never answer,
 * close without answering, answer with something other than HTTP, send
 * headers that never end, send its
 * 200 in two writes, or send a server banner in the same write as its 200.
 */
export async function startConnectProxy() {
  const targets = []
  const sockets = new Set()
  const server = http.createServer((_req, res) => {
    res.writeHead(405).end()
  })

  server.on('connect', function handleConnect(req, clientSocket, head) {
    targets.push(req.url)
    sockets.add(clientSocket)
    const [host, port] = req.url.split(':')
    if (host === connectProxyTargets.blocked) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
      return
    }
    if (host === connectProxyTargets.silent) {
      return
    }
    if (host === connectProxyTargets.closesEarly) {
      clientSocket.end()
      return
    }
    if (host === connectProxyTargets.endlessHeaders) {
      clientSocket.write(
        `HTTP/1.1 200 OK\r\nX-Padding: ${'x'.repeat(20 * 1024)}\r\n`
      )
      return
    }
    if (host === connectProxyTargets.notHttp) {
      clientSocket.write(`SSH-2.0-not-a-proxy\r\n\r\n`)
      return
    }
    if (host === connectProxyTargets.splitResponse) {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n')
      setTimeout(() => {
        clientSocket.write(`\r\n${bannerSentWithResponse}`)
      }, 50)
      return
    }
    if (host === connectProxyTargets.bannerWithResponse) {
      clientSocket.write(
        `HTTP/1.1 200 Connection Established\r\n\r\n${bannerSentWithResponse}`
      )
      return
    }
    const upstream = net.connect(Number(port), host, function onUpstream() {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    sockets.add(upstream)
    upstream.on('error', () => clientSocket.destroy())
    clientSocket.on('error', () => upstream.destroy())
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  return {
    url: `http://127.0.0.1:${port}`,
    targets,
    close: () =>
      new Promise((resolve) => {
        sockets.forEach((socket) => socket.destroy())
        server.close(resolve)
      })
  }
}
