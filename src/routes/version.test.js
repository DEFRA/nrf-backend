import { statusCodes } from '../common/constants/status-codes.js'
import { setupTestServer } from '../test-utils/setup-test-server.js'

describe('GET /version', () => {
  const getServer = setupTestServer()

  it('should return the version', async () => {
    const response = await getServer().inject({
      method: 'GET',
      url: '/version'
    })

    expect(response.statusCode).toBe(statusCodes.ok)
    const body = JSON.parse(response.payload)
    expect(body).toHaveProperty('version')
    expect(typeof body.version).toBe('string')
  })
})

describe('getGitHash', () => {
  it('should return GIT_HASH env var when set', async () => {
    vi.stubEnv('GIT_HASH', 'abc123')

    vi.resetModules()
    const { version } = await import('./version.js')

    expect(version.handler(null, { response: (v) => v })).toEqual({
      version: 'abc123'
    })

    vi.unstubAllEnvs()
  })
})
