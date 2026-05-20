const TEST_API_KEY = 'test-api-key'

export const withApiKey = (opts = {}) => ({
  ...opts,
  headers: {
    'x-api-key': TEST_API_KEY,
    ...(opts.headers ?? {})
  }
})

const wrapServer = (server) => ({
  inject: (opts) => server.inject(withApiKey(opts)),
  get raw() {
    return server
  }
})

export const setupTestServer = () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('../server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server?.stop()
  })

  return () => wrapServer(server)
}
