import { getTraceId } from '@defra/hapi-tracing'

import { config } from '../../config.js'
import { statusCodes } from '../../common/constants/status-codes.js'

vi.mock('@defra/hapi-tracing', () => ({
  getTraceId: vi.fn()
}))

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
    const mockResponse = {
      boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
      boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
      intersectingEdps: ['edp-1']
    }

    vi.mocked(getTraceId).mockReturnValue('trace-456')

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
        intersectingEdps: mockResponse.intersectingEdps
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

  it('should return error and geometry on non-ok response with error and boundaryGeometryWgs84', async () => {
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
          boundaryGeometryWgs84: mockGeometry
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
      boundaryGeometryWgs84: mockGeometry
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
    vi.spyOn(config, 'get').mockReturnValue(null)
    delete process.env.ENVIRONMENT
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should wrap the geometry as a synthetic geojson upload and return geojson on success', async () => {
    const mockResponse = {
      boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
      boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
      intersectingEdps: ['edp-1']
    }

    vi.mocked(getTraceId).mockReturnValue('trace-789')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      geojson: {
        boundaryGeometryOriginal: mockResponse.boundaryGeometryOriginal,
        boundaryGeometryWgs84: mockResponse.boundaryGeometryWgs84,
        intersectingEdps: mockResponse.intersectingEdps
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
    expect(JSON.parse(await uploaded.text())).toEqual(mockGeometry)
  })

  it('should propagate error and boundaryGeometryWgs84 on non-ok response', async () => {
    const mockReturnedGeometry = {
      type: 'FeatureCollection',
      features: []
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: statusCodes.badRequest,
      json: () =>
        Promise.resolve({
          error: 'Invalid geometry',
          boundaryGeometryWgs84: mockReturnedGeometry
        })
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      error: 'Invalid geometry',
      statusCode: statusCodes.badRequest,
      boundaryGeometryWgs84: mockReturnedGeometry
    })
  })

  it('should return error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      error: 'Unable to contact impact assessor service'
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
    vi.spyOn(config, 'get').mockReturnValue(null)
    delete process.env.ENVIRONMENT
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should return nearby WWTWs on success', async () => {
    const mockWwtws = [
      { wwtwId: '101', wwtwName: 'Great Billing WRC', distanceKm: 3.2 }
    ]

    vi.mocked(getTraceId).mockReturnValue('trace-123')

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
})
