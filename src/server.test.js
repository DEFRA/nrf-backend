const mockConfig = vi.hoisted(() => new Map())

vi.mock('./config.js', () => ({
  config: {
    get: (key) => mockConfig.get(key)
  }
}))

vi.mock('./plugins/auth.js', () => ({
  auth: { plugin: { name: 'auth', register: vi.fn() } }
}))

vi.mock('./plugins/router.js', () => ({
  router: { plugin: { name: 'router', register: vi.fn() } }
}))

vi.mock('./plugins/notify-worker.js', () => ({
  notifyWorker: {
    plugin: { name: 'notify-worker', register: vi.fn() }
  }
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

const { createServer } = await import('./server.js')

describe('#createServer', () => {
  beforeEach(() => {
    mockConfig.set('host', '0.0.0.0')
    mockConfig.set('port', 3001)
    mockConfig.set('postgres', {})
  })

  it('Should register the core plugins', async () => {
    const server = await createServer()

    const registeredPlugins = Object.keys(server.registrations)
    expect(registeredPlugins).toEqual(
      expect.arrayContaining([
        'requestLogger',
        'requestTracing',
        'secureContext',
        'pulse',
        'auth',
        'router',
        'postgres',
        'notify-worker'
      ])
    )

    await server.stop()
  })
})
