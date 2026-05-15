import { postgres } from './postgres.js'

const mockGetAuthToken = vi.fn().mockResolvedValue('iam-token')
const mockSignerConstructor = vi.fn()

vi.mock('@aws-sdk/rds-signer', () => ({
  Signer: function (opts) {
    mockSignerConstructor(opts)
    return { getAuthToken: mockGetAuthToken }
  }
}))

const mockFromNodeProviderChain = vi.fn().mockReturnValue('mock-credentials')

vi.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: () => mockFromNodeProviderChain()
}))

const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
const mockEnd = vi.fn().mockResolvedValue(undefined)
const mockPoolConstructor = vi.fn()

vi.mock('pg-pool', () => ({
  default: function (config) {
    mockPoolConstructor(config)
    return { query: mockQuery, end: mockEnd }
  }
}))

function makeServer() {
  const decorations = {}
  const stopHandlers = []
  return {
    decorate: vi.fn((type, name, value) => {
      decorations[`${type}.${name}`] = value
    }),
    events: {
      on: vi.fn((event, handler) => {
        if (event === 'stop') {
          stopHandlers.push(handler)
        }
      })
    },
    decorations,
    stopHandlers
  }
}

const baseOptions = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  database: 'nrf_backend',
  useIAM: false,
  localPassword: 'password'
}

describe('#postgres plugin', () => {
  beforeEach(() => {
    mockGetAuthToken.mockResolvedValue('iam-token')
    mockFromNodeProviderChain.mockReturnValue('mock-credentials')
    mockQuery.mockResolvedValue({ rows: [] })
    mockEnd.mockResolvedValue(undefined)
  })

  describe('When registered with valid options (no IAM)', () => {
    let server

    beforeEach(async () => {
      server = makeServer()
      await postgres.plugin.register(server, baseOptions)
    })

    test('Should test the connection', () => {
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1')
    })

    test('Should decorate server with pg pool', () => {
      expect(server.decorate).toHaveBeenCalledWith(
        'server',
        'pg',
        expect.objectContaining({ query: mockQuery })
      )
    })

    test('Should decorate request with pg pool', () => {
      expect(server.decorate).toHaveBeenCalledWith(
        'request',
        'pg',
        expect.objectContaining({ query: mockQuery })
      )
    })

    test('Should register stop event handler', () => {
      expect(server.events.on).toHaveBeenCalledWith(
        'stop',
        expect.any(Function)
      )
    })

    test('Should end pool on server stop', async () => {
      await server.stopHandlers[0]()
      expect(mockEnd).toHaveBeenCalled()
    })

    test('Should create pool with correct config', () => {
      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'postgres',
          host: 'localhost',
          port: 5432,
          database: 'nrf_backend'
        })
      )
    })

    test('Should use localPassword as password provider', async () => {
      const poolConfig = mockPoolConstructor.mock.calls.at(-1)[0]
      const password = await poolConfig.password()
      expect(password).toBe('password')
    })
  })

  describe('When registered with IAM enabled', () => {
    beforeEach(async () => {
      const server = makeServer()
      await postgres.plugin.register(server, {
        ...baseOptions,
        useIAM: true,
        region: 'eu-west-2'
      })
    })

    test('Should create Signer with correct options', async () => {
      const poolConfig = mockPoolConstructor.mock.calls.at(-1)[0]
      await poolConfig.password()

      expect(mockSignerConstructor).toHaveBeenCalledWith({
        hostname: 'localhost',
        port: 5432,
        username: 'postgres',
        credentials: expect.anything(),
        region: 'eu-west-2'
      })
    })

    test('Should return IAM auth token as password', async () => {
      const poolConfig = mockPoolConstructor.mock.calls.at(-1)[0]
      const token = await poolConfig.password()
      expect(token).toBe('iam-token')
    })
  })

  describe('When registered with invalid options', () => {
    test('Should throw when required fields are missing', async () => {
      const server = makeServer()
      await expect(
        postgres.plugin.register(server, { useIAM: false })
      ).rejects.toThrow()
    })

    test('Should throw when useIAM is true but region is missing', async () => {
      const server = makeServer()
      await expect(
        postgres.plugin.register(server, { ...baseOptions, useIAM: true })
      ).rejects.toThrow()
    })
  })

  describe('When pool config overrides are provided', () => {
    test('Should pass pool overrides to Pool constructor', async () => {
      const server = makeServer()
      await postgres.plugin.register(server, {
        ...baseOptions,
        pool: { max: 5, idleTimeoutMillis: 1000 }
      })

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ max: 5, idleTimeoutMillis: 1000 })
      )
    })
  })
})
