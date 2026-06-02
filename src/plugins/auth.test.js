import Hapi from '@hapi/hapi'

import { config } from '../config.js'
import { auth } from './auth.js'

// BACKEND_API_KEY is set to this value in vitest.config.js
const VALID_KEY = 'test-api-key'

async function buildServer() {
  const server = Hapi.server()
  await server.register(auth)
  server.route({
    method: 'GET',
    path: '/protected',
    handler: () => ({ ok: true })
  })
  server.route({
    method: 'GET',
    path: '/open',
    options: { auth: false },
    handler: () => ({ ok: true })
  })
  await server.initialize()
  return server
}

describe('auth plugin', () => {
  let server

  beforeEach(async () => {
    server = await buildServer()
  })

  afterEach(async () => {
    await server.stop()
    vi.restoreAllMocks()
  })

  it('allows a request with a valid x-api-key', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-api-key': VALID_KEY }
    })

    expect(res.statusCode).toBe(200)
  })

  it('rejects a request with no x-api-key', async () => {
    const res = await server.inject({ method: 'GET', url: '/protected' })

    expect(res.statusCode).toBe(401)
  })

  it('rejects a wrong x-api-key of the same length', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-api-key': 'xxxxxxxxxxxx' }
    })

    expect(res.statusCode).toBe(401)
  })

  it('rejects a wrong x-api-key of a different length', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-api-key': 'short' }
    })

    expect(res.statusCode).toBe(401)
  })

  it('allows an auth: false route without a key', async () => {
    const res = await server.inject({ method: 'GET', url: '/open' })

    expect(res.statusCode).toBe(200)
  })

  it('returns 500 when no api key is configured', async () => {
    vi.spyOn(config, 'get').mockReturnValue('')

    const res = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-api-key': VALID_KEY }
    })

    expect(res.statusCode).toBe(500)
  })
})
