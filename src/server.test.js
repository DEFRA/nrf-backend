const mockConfig = vi.hoisted(() => new Map())

vi.mock('./config.js', () => ({
  config: {
    get: (key) => mockConfig.get(key)
  }
}))

vi.mock('./plugins/router.js', () => ({
  router: { plugin: { name: 'router', register: vi.fn() } }
}))

vi.mock('./plugins/swagger.js', () => ({
  swagger: { plugin: { name: 'swagger', register: vi.fn() } }
}))

vi.mock('./common/helpers/logging/request-logger.js', () => ({
  requestLogger: { plugin: { name: 'requestLogger', register: vi.fn() } }
}))

vi.mock('./common/helpers/request-tracing.js', () => ({
  requestTracing: { plugin: { name: 'requestTracing', register: vi.fn() } }
}))

vi.mock('@defra/hapi-secure-context', () => ({
  secureContext: { plugin: { name: 'secureContext', register: vi.fn() } }
}))

vi.mock('./common/helpers/pulse.js', () => ({
  pulse: { plugin: { name: 'pulse', register: vi.fn() } }
}))

vi.mock('./common/helpers/fail-action.js', () => ({
  failAction: vi.fn()
}))

vi.mock('./common/helpers/proxy/setup-proxy.js', () => ({
  setupProxy: vi.fn()
}))

vi.mock('./common/helpers/postgres.js', () => ({
  postgres: { plugin: { name: 'postgres', register: vi.fn() } }
}))

vi.mock('@hapi/inert', () => ({
  default: { plugin: { name: 'inert', register: vi.fn() } }
}))

const { createServer } = await import('./server.js')

describe('#createServer', () => {
  beforeEach(() => {
    mockConfig.set('host', '0.0.0.0')
    mockConfig.set('port', 3001)
    mockConfig.set('useSwagger', false)
    mockConfig.set('postgres', {})
  })

  test('Should not register swagger when useSwagger is false', async () => {
    const server = await createServer()

    const registeredPlugins = Object.keys(server.registrations)
    expect(registeredPlugins).not.toContain('swagger')
    expect(registeredPlugins).not.toContain('inert')

    await server.stop()
  })

  test('Should register swagger when useSwagger is true', async () => {
    mockConfig.set('useSwagger', true)

    const server = await createServer()

    const registeredPlugins = Object.keys(server.registrations)
    expect(registeredPlugins).toContain('swagger')
    expect(registeredPlugins).toContain('inert')

    await server.stop()
  })
})
