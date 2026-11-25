import net from 'node:net'

import { statusCodes } from '../../common/constants/status-codes.js'

const endOfHeaders = '\r\n\r\n'
const statusLinePattern = /^HTTP\/1\.[01] (\d{3})/

/** The most header bytes read from the proxy, as node:http's default limit. */
const maxProxyResponseHeaderBytes = 16 * 1024

/**
 * Reads the proxy's answer to CONNECT from the bytes received so far.
 * @param {Buffer} received
 * @returns {{ statusCode: number, statusLine: string, head: Buffer } | undefined}
 *   undefined until the whole header block has arrived; statusCode is NaN when
 *   the status line is not HTTP; head is any server bytes after the headers
 */
export function parseConnectResponse(received) {
  const headersEnd = received.indexOf(endOfHeaders)
  if (headersEnd === -1) {
    return undefined
  }
  const statusLine = received
    .subarray(0, received.indexOf('\r\n'))
    .toString('latin1')
  const match = statusLinePattern.exec(statusLine)
  return {
    statusCode: match ? Number(match[1]) : Number.NaN,
    statusLine,
    head: received.subarray(headersEnd + endOfHeaders.length)
  }
}

/**
 * @param {ReturnType<typeof parseConnectResponse> & {}} response
 */
const refusal = ({ statusCode, statusLine }) =>
  Number.isNaN(statusCode)
    ? new Error(`Proxy sent an unexpected response: ${statusLine}`)
    : new Error(`Proxy refused tunnel (${statusCode})`)

const httpPort = 80
const httpsPort = 443
const defaultPorts = { 'http:': httpPort, 'https:': httpsPort }

/**
 * The proxy's host and port. Refuses credentials in the URL, since the
 * CONNECT request does not send them and the proxy would refuse the tunnel
 * with no clue why.
 * @param {string} proxyUrl
 */
const proxyAddress = (proxyUrl) => {
  const proxy = new URL(proxyUrl)
  if (proxy.username || proxy.password) {
    throw new Error('Proxy URLs with credentials are not supported')
  }
  return {
    host: proxy.hostname,
    port: Number(proxy.port || defaultPorts[proxy.protocol] || httpPort)
  }
}

const ignoreError = () => {}

/**
 * Opens a raw TCP tunnel to host:port through an HTTP CONNECT proxy (the CDP
 * squid proxy), for protocols such as SFTP that can't use an HTTP agent.
 *
 * Writes the CONNECT request on a plain socket rather than with node:http:
 * setupProxy starts global-agent, which takes over every http.request and
 * would send this one to the proxy as an ordinary proxied request.
 * @param {{ proxyUrl: string, host: string, port: number, timeoutMs: number }} params
 * @returns {Promise<net.Socket>}
 */
export async function openProxyTunnel({ proxyUrl, host, port, timeoutMs }) {
  const proxy = proxyAddress(proxyUrl)
  const target = `${host}:${port}`

  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host)
    let received = Buffer.alloc(0)

    const stopListening = () => {
      clearTimeout(timer)
      socket.off('readable', onReadable)
      socket.off('error', fail)
      socket.off('close', onClose)
    }
    const fail = (error) => {
      stopListening()
      socket.destroy()
      reject(error)
    }
    const onClose = () =>
      fail(new Error('Proxy closed the connection before opening a tunnel'))
    const timer = setTimeout(function onTimeout() {
      fail(new Error(`Proxy did not open a tunnel within ${timeoutMs}ms`))
    }, timeoutMs)

    // Reads with 'readable' rather than 'data', so the socket is not left
    // flowing with no listener: the SSH client's own 'data' listener starts
    // it once it has the socket.
    function onReadable() {
      let chunk
      while ((chunk = socket.read()) !== null) {
        received = Buffer.concat([received, chunk])
      }
      const response = parseConnectResponse(received)
      if (!response) {
        if (received.length > maxProxyResponseHeaderBytes) {
          fail(new Error('Proxy response headers are too large'))
        }
        return
      }
      if (response.statusCode !== statusCodes.ok) {
        fail(refusal(response))
        return
      }
      stopListening()
      // Until the caller adds its own listener, an 'error' on the socket would
      // be uncaught and stop the process.
      socket.on('error', ignoreError)
      // The server's first bytes (the SSH banner) can arrive with the proxy's
      // 200; put them back or the SSH handshake waits for them forever.
      if (response.head.length > 0) {
        socket.unshift(response.head)
      }
      resolve(socket)
    }

    socket.on('readable', onReadable)
    socket.once('error', fail)
    socket.once('close', onClose)
    socket.once('connect', function onConnect() {
      socket.write(
        `CONNECT ${target} HTTP/1.1\r\nHost: ${target}${endOfHeaders}`
      )
    })
  })
}
