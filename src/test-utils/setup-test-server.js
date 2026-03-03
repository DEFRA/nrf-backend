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

  return () => server
}
