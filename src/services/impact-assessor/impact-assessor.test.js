import { withTraceId } from '@defra/hapi-tracing'

import { config } from '../../config.js'
import { statusCodes } from '../../common/constants/status-codes.js'

vi.mock('@defra/hapi-tracing', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    withTraceId: vi.fn((_, headers = {}) => headers)
  }
})

const {
  getImpactAssessorUrl,
  checkBoundary,
  checkBoundaryGeometry,
  findNearbyWasteWaterTreatmentWorks
} = await import('./impact-assessor.js')

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
    vi.spyOn(config, 'get').mockImplementation((key) =>
      key === 'tracing.header' ? 'x-cdp-request-id' : null
    )
    delete process.env.ENVIRONMENT

    expect(getImpactAssessorUrl()).toBe('http://localhost:8085')
  })
})

describe('checkBoundary', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(config, 'get').mockImplementation((key) =>
      key === 'tracing.header' ? 'x-cdp-request-id' : null
    )
    delete process.env.ENVIRONMENT
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should return geojson on success', async () => {
    const mockResponse = {
      boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
      boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
      intersectingEdps: ['edp-1'],
      boundaryMetadata: { areaHa: 42.5 }
    }

    vi.mocked(withTraceId).mockImplementation((_, headers = {}) => ({
      ...headers,
      'x-cdp-request-id': 'trace-456'
    }))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      geojson: {
        boundaryGeometryOriginal: mockResponse.boundaryGeometryOriginal,
        boundaryGeometryWgs84: mockResponse.boundaryGeometryWgs84,
        intersectingEdps: mockResponse.intersectingEdps,
        boundaryMetadata: mockResponse.boundaryMetadata
      }
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8085/check-boundary',
      expect.objectContaining({
        method: 'POST',
        headers: { 'x-cdp-request-id': 'trace-456' }
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

  it('should return error and both geometry fields on non-ok response when present', async () => {
    const mockOriginalGeometry = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon' } }]
    }
    const mockWgs84Geometry = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon' } }]
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badRequest,
      json: () =>
        Promise.resolve({
          error: 'Invalid geometry',
          boundaryGeometryOriginal: mockOriginalGeometry,
          boundaryGeometryWgs84: mockWgs84Geometry
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
      boundaryGeometryOriginal: mockOriginalGeometry,
      boundaryGeometryWgs84: mockWgs84Geometry
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

  it('should fall back to HTTP status string when error body has neither error nor detail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.internalServerError,
      json: () => Promise.resolve({})
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      error: `HTTP ${statusCodes.internalServerError}`,
      statusCode: statusCodes.internalServerError
    })
  })

  it('should fall back to HTTP status string when error response body is not JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badGateway,
      json: () => Promise.reject(new Error('not json'))
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      error: `HTTP ${statusCodes.badGateway}`,
      statusCode: statusCodes.badGateway
    })
  })

  it('should return error when intersectingEdps is missing from the response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
          boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] }
        })
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingEdps is not an array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
          boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
          intersectingEdps: 'not-an-array'
        })
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when the response body is unexpected JSON (no geometry fields)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ unexpected: 'shape' })
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingEdps is present but geometry fields are missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          intersectingEdps: []
        })
    })

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should omit the tracing header when no trace id is set', async () => {
    vi.mocked(withTraceId).mockImplementation((_, headers = {}) => headers)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          boundaryGeometryOriginal: {},
          boundaryGeometryWgs84: {},
          intersectingEdps: []
        })
    })

    await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    const [, calledOpts] = globalThis.fetch.mock.calls[0]
    expect(calledOpts.headers).toEqual({})
  })
})

describe('checkBoundaryGeometry', () => {
  const originalFetch = globalThis.fetch
  const mockGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-1.5, 52.0],
        [-1.4, 52.0],
        [-1.4, 52.1],
        [-1.5, 52.0]
      ]
    ]
  }

  beforeEach(() => {
    vi.spyOn(config, 'get').mockImplementation((key) =>
      key === 'tracing.header' ? 'x-cdp-request-id' : null
    )
    delete process.env.ENVIRONMENT
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should wrap the geometry as a synthetic geojson upload and return geojson on success', async () => {
    const mockResponse = {
      boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
      boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
      intersectingEdps: ['edp-1'],
      boundaryMetadata: { areaHa: 10.0 }
    }

    vi.mocked(withTraceId).mockImplementation((_, headers = {}) => ({
      ...headers,
      'x-cdp-request-id': 'trace-789'
    }))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      geojson: {
        boundaryGeometryOriginal: mockResponse.boundaryGeometryOriginal,
        boundaryGeometryWgs84: mockResponse.boundaryGeometryWgs84,
        intersectingEdps: mockResponse.intersectingEdps,
        boundaryMetadata: mockResponse.boundaryMetadata
      }
    })

    const [calledUrl, calledOpts] = globalThis.fetch.mock.calls[0]
    expect(calledUrl).toBe('http://localhost:8085/check-boundary')
    expect(calledOpts.method).toBe('POST')
    expect(calledOpts.headers).toEqual({ 'x-cdp-request-id': 'trace-789' })
    expect(calledOpts.body).toBeInstanceOf(FormData)

    const uploaded = calledOpts.body.get('geometry_file')
    expect(uploaded).toBeInstanceOf(Blob)
    expect(uploaded.name).toBe('input.geojson')
    expect(uploaded.type).toBe('application/geo+json')
    // The geometry must be wrapped in a FeatureCollection so the IA's
    // geopandas/fiona reader can parse it.
    expect(JSON.parse(await uploaded.text())).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: mockGeometry,
          properties: {}
        }
      ]
    })
  })

  it('should propagate error and both geometry fields on non-ok response', async () => {
    const mockReturnedOriginalGeometry = {
      type: 'FeatureCollection',
      features: []
    }
    const mockReturnedWgs84Geometry = {
      type: 'FeatureCollection',
      features: []
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badRequest,
      json: () =>
        Promise.resolve({
          error: 'Invalid geometry',
          boundaryGeometryOriginal: mockReturnedOriginalGeometry,
          boundaryGeometryWgs84: mockReturnedWgs84Geometry
        })
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      error: 'Invalid geometry',
      statusCode: statusCodes.badRequest,
      boundaryGeometryOriginal: mockReturnedOriginalGeometry,
      boundaryGeometryWgs84: mockReturnedWgs84Geometry
    })
  })

  it('should return error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      error: 'Unable to contact impact assessor service'
    })
  })

  it('should return error when intersectingEdps is missing from the response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
          boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] }
        })
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingEdps is not an array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
          boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
          intersectingEdps: null
        })
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when the response body is unexpected JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' })
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingEdps is present but geometry fields are missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          intersectingEdps: []
        })
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should pass through a FeatureCollection input unchanged', async () => {
    const featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: mockGeometry,
          properties: { name: 'site-a' }
        }
      ]
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          boundaryGeometryOriginal: {},
          boundaryGeometryWgs84: {},
          intersectingEdps: []
        })
    })

    await checkBoundaryGeometry(featureCollection)

    const [, calledOpts] = globalThis.fetch.mock.calls[0]
    const uploaded = calledOpts.body.get('geometry_file')
    expect(JSON.parse(await uploaded.text())).toEqual(featureCollection)
  })

  it('should wrap a Feature input in a FeatureCollection', async () => {
    const feature = {
      type: 'Feature',
      geometry: mockGeometry,
      properties: { name: 'site-b' }
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          boundaryGeometryOriginal: {},
          boundaryGeometryWgs84: {},
          intersectingEdps: []
        })
    })

    await checkBoundaryGeometry(feature)

    const [, calledOpts] = globalThis.fetch.mock.calls[0]
    const uploaded = calledOpts.body.get('geometry_file')
    expect(JSON.parse(await uploaded.text())).toEqual({
      type: 'FeatureCollection',
      features: [feature]
    })
  })
})

describe('findNearbyWasteWaterTreatmentWorks', () => {
  const originalFetch = globalThis.fetch
  const mockGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0]
      ]
    ]
  }

  beforeEach(() => {
    vi.spyOn(config, 'get').mockImplementation((key) =>
      key === 'tracing.header' ? 'x-cdp-request-id' : null
    )
    delete process.env.ENVIRONMENT
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should return nearby WWTWs on success', async () => {
    const mockWwtws = [
      { wwtwId: '101', wwtwName: 'Great Billing WRC', distanceKm: 3.2 }
    ]

    vi.mocked(withTraceId).mockImplementation((_, headers = {}) => ({
      ...headers,
      'x-cdp-request-id': 'trace-123'
    }))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ nearbyWwtws: mockWwtws })
    })

    const result = await findNearbyWasteWaterTreatmentWorks(mockGeometry)

    expect(result).toEqual({ nearbyWwtws: mockWwtws })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8085/wwtw/nearby',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cdp-request-id': 'trace-123'
        },
        body: JSON.stringify({ geometry: mockGeometry })
      })
    )
  })

  it('should return error on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badRequest,
      json: () => Promise.resolve({ error: 'Invalid geometry' })
    })

    const result = await findNearbyWasteWaterTreatmentWorks(mockGeometry)

    expect(result).toEqual({
      error: 'Invalid geometry',
      statusCode: statusCodes.badRequest
    })
  })

  it('should return empty array when nearbyWwtws missing from response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    })

    const result = await findNearbyWasteWaterTreatmentWorks(mockGeometry)

    expect(result).toEqual({ nearbyWwtws: [] })
  })

  it('should return error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await findNearbyWasteWaterTreatmentWorks(mockGeometry)

    expect(result).toEqual({
      error: 'Unable to contact impact assessor service'
    })
  })

  it('should fall back to HTTP status string when error body has neither error nor detail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.internalServerError,
      json: () => Promise.resolve({})
    })

    const result = await findNearbyWasteWaterTreatmentWorks(mockGeometry)

    expect(result).toEqual({
      error: `HTTP ${statusCodes.internalServerError}`,
      statusCode: statusCodes.internalServerError
    })
  })

  it('should fall back to HTTP status string when error response body is not JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badGateway,
      json: () => Promise.reject(new Error('not json'))
    })

    const result = await findNearbyWasteWaterTreatmentWorks(mockGeometry)

    expect(result).toEqual({
      error: `HTTP ${statusCodes.badGateway}`,
      statusCode: statusCodes.badGateway
    })
  })

  it('should prefer detail over the HTTP fallback when error is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badRequest,
      json: () => Promise.resolve({ detail: 'Geometry could not be parsed' })
    })

    const result = await findNearbyWasteWaterTreatmentWorks(mockGeometry)

    expect(result).toEqual({
      error: 'Geometry could not be parsed',
      statusCode: statusCodes.badRequest
    })
  })

  it('should omit the tracing header when no trace id is set', async () => {
    vi.mocked(withTraceId).mockImplementation((_, headers = {}) => headers)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ nearbyWwtws: [] })
    })

    await findNearbyWasteWaterTreatmentWorks(mockGeometry)

    const [, calledOpts] = globalThis.fetch.mock.calls[0]
    expect(calledOpts.headers).toEqual({ 'Content-Type': 'application/json' })
  })
})
