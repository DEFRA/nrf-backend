import { config } from '../../config.js'
import { statusCodes } from '../../common/constants/status-codes.js'

const { getImpactAssessorUrl, checkBoundary } =
  await import('./impact-assessor.js')

describe('getImpactAssessorUrl', () => {
  const originalEnv = process.env.ENVIRONMENT

  afterEach(() => {
    process.env.ENVIRONMENT = originalEnv
  })

  it('should return explicit URL from config when set', () => {
    vi.spyOn(config, 'get').mockReturnValue(
      'https://custom-assessor.example.com'
    )

    expect(getImpactAssessorUrl()).toBe('https://custom-assessor.example.com')
  })

  it('should derive URL from ENVIRONMENT when config is not set', () => {
    vi.spyOn(config, 'get').mockReturnValue(null)
    process.env.ENVIRONMENT = 'dev'

    expect(getImpactAssessorUrl()).toBe(
      'https://nrf-impact-assessor.dev.cdp-int.defra.cloud'
    )
  })

  it('should return localhost fallback when no config or environment', () => {
    vi.spyOn(config, 'get').mockReturnValue(null)
    delete process.env.ENVIRONMENT

    expect(getImpactAssessorUrl()).toBe('http://localhost:8085')
  })
})

describe('checkBoundary', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(config, 'get').mockReturnValue(null)
    delete process.env.ENVIRONMENT
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should return geojson on success', async () => {
    const mockGeojson = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon' } }]
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockGeojson)
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({ geojson: mockGeojson })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8085/check-boundary',
      expect.objectContaining({
        method: 'POST'
      })
    )
  })

  it('should append proj query parameter when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: 'FeatureCollection', features: [] })
    })

    await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json',
      { proj: 'EPSG:4326' }
    )

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8085/check-boundary?proj=EPSG%3A4326',
      expect.objectContaining({
        method: 'POST'
      })
    )
  })

  it('should return error on non-ok response with detail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badRequest,
      json: () => Promise.resolve({ detail: 'Unsupported file format: .txt' })
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.txt',
      'text/plain'
    )

    expect(result).toEqual({
      error: 'Unsupported file format: .txt',
      statusCode: statusCodes.badRequest
    })
  })

  it('should return error and geometry on non-ok response with error and geometry', async () => {
    const mockGeometry = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon' } }]
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badRequest,
      json: () =>
        Promise.resolve({
          error: 'Invalid geometry',
          geometry: mockGeometry
        })
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      error: 'Invalid geometry',
      statusCode: statusCodes.badRequest,
      geometry: mockGeometry
    })
  })

  it('should return error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      error: 'Unable to contact impact assessor service'
    })
  })
})
