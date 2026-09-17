import { http, HttpResponse } from 'msw'
import { withTraceId } from '@defra/hapi-tracing'

import { config } from '../../config.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupMswServer } from '../../test-utils/setup-msw-server.js'

vi.mock('@defra/hapi-tracing', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    withTraceId: vi.fn((_, headers = {}) => headers)
  }
})

const mswServer = setupMswServer()

const { getImpactAssessorUrl, checkBoundary, checkBoundaryGeometry } =
  await import('./impact-assessor.js')

const CHECK_BOUNDARY_URL = 'http://localhost:8085/check-boundary'

const mockCheckBoundary = (handler) =>
  mswServer.use(http.post(CHECK_BOUNDARY_URL, handler))

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
  beforeEach(() => {
    vi.spyOn(config, 'get').mockImplementation((key) =>
      key === 'tracing.header' ? 'x-cdp-request-id' : null
    )
    delete process.env.ENVIRONMENT
  })

  it('should return geojson on success', async () => {
    const mockResponse = {
      boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
      boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
      intersectingEdps: ['edp-1'],
      intersectingExcludedAreas: ['Exclusion Zone A'],
      boundaryMetadata: { areaHa: 42.5 }
    }

    vi.mocked(withTraceId).mockImplementation((_, headers = {}) => ({
      ...headers,
      'x-cdp-request-id': 'trace-456'
    }))

    let capturedRequest
    mockCheckBoundary(({ request }) => {
      capturedRequest = request
      return HttpResponse.json(mockResponse)
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
        intersectingExcludedAreas: mockResponse.intersectingExcludedAreas,
        boundaryMetadata: mockResponse.boundaryMetadata
      }
    })
    expect(capturedRequest.url).toBe(CHECK_BOUNDARY_URL)
    expect(capturedRequest.method).toBe('POST')
    expect(capturedRequest.headers.get('x-cdp-request-id')).toBe('trace-456')
  })

  it('should return error on non-ok response with detail', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json(
        { detail: 'Unsupported file format: .txt' },
        { status: statusCodes.badRequest }
      )
    )

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

    mockCheckBoundary(() =>
      HttpResponse.json(
        {
          error: 'Invalid geometry',
          boundaryGeometryOriginal: mockOriginalGeometry,
          boundaryGeometryWgs84: mockWgs84Geometry,
          boundaryMetadata: { bounds: {}, centre: [1, 52] }
        },
        { status: statusCodes.badRequest }
      )
    )

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      error: 'Invalid geometry',
      statusCode: statusCodes.badRequest,
      boundaryGeometryOriginal: mockOriginalGeometry,
      boundaryGeometryWgs84: mockWgs84Geometry,
      boundaryMetadata: { bounds: {}, centre: [1, 52] }
    })
  })

  it('should return error on network failure', async () => {
    mockCheckBoundary(() => HttpResponse.error())

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      error: 'impact_assessor_unreachable'
    })
  })

  it('should fall back to a generic code when error body has neither error nor detail', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({}, { status: statusCodes.internalServerError })
    )

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      error: 'boundary_check_failed',
      statusCode: statusCodes.internalServerError
    })
  })

  it('should fall back to a generic code when error response body is not JSON', async () => {
    mockCheckBoundary(
      () =>
        new HttpResponse('<html>Bad Gateway</html>', {
          status: statusCodes.badGateway
        })
    )

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result).toEqual({
      error: 'boundary_check_failed',
      statusCode: statusCodes.badGateway
    })
  })

  it('should return error when intersectingEdps is missing from the response', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({
        boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
        boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] }
      })
    )

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingEdps is not an array', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({
        boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
        boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
        intersectingEdps: 'not-an-array'
      })
    )

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingExcludedAreas is missing from the response', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({
        boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
        boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
        intersectingEdps: []
      })
    )

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingExcludedAreas is not an array', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({
        boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
        boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
        intersectingEdps: [],
        intersectingExcludedAreas: 'not-an-array'
      })
    )

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return impact_assessor_bad_response when a 200 body is unexpected JSON (no geometry fields)', async () => {
    mockCheckBoundary(() => HttpResponse.json({ unexpected: 'shape' }))

    const result = await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(result.error).toBe('impact_assessor_bad_response')
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingEdps is present but geometry fields are missing', async () => {
    mockCheckBoundary(() => HttpResponse.json({ intersectingEdps: [] }))

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

    let capturedRequest
    mockCheckBoundary(({ request }) => {
      capturedRequest = request
      return HttpResponse.json({
        boundaryGeometryOriginal: {},
        boundaryGeometryWgs84: {},
        intersectingEdps: [],
        intersectingExcludedAreas: []
      })
    })

    await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(capturedRequest.headers.get('x-cdp-request-id')).toBeNull()
  })

  it('should send the x-api-key header when impactAssessorApiKey is configured', async () => {
    vi.spyOn(config, 'get').mockImplementation((key) => {
      if (key === 'tracing.header') {
        return 'x-cdp-request-id'
      }
      if (key === 'impactAssessorApiKey') {
        return 'ia-secret-key'
      }
      return null
    })
    vi.mocked(withTraceId).mockImplementation((_, headers = {}) => headers)

    let capturedRequest
    mockCheckBoundary(({ request }) => {
      capturedRequest = request
      return HttpResponse.json({
        boundaryGeometryOriginal: {},
        boundaryGeometryWgs84: {},
        intersectingEdps: [],
        intersectingExcludedAreas: []
      })
    })

    await checkBoundary(
      Buffer.from('test'),
      'test.geojson',
      'application/geo+json'
    )

    expect(capturedRequest.headers.get('x-api-key')).toBe('ia-secret-key')
  })
})

describe('checkBoundaryGeometry', () => {
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

  it('should wrap the geometry as a synthetic geojson upload and return geojson on success', async () => {
    const mockResponse = {
      boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
      boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
      intersectingEdps: ['edp-1'],
      intersectingExcludedAreas: [],
      boundaryMetadata: { areaHa: 10.0 }
    }

    vi.mocked(withTraceId).mockImplementation((_, headers = {}) => ({
      ...headers,
      'x-cdp-request-id': 'trace-789'
    }))

    let capturedRequest
    mockCheckBoundary(({ request }) => {
      capturedRequest = request
      return HttpResponse.json(mockResponse)
    })

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      geojson: {
        boundaryGeometryOriginal: mockResponse.boundaryGeometryOriginal,
        boundaryGeometryWgs84: mockResponse.boundaryGeometryWgs84,
        intersectingEdps: mockResponse.intersectingEdps,
        intersectingExcludedAreas: mockResponse.intersectingExcludedAreas,
        boundaryMetadata: mockResponse.boundaryMetadata
      }
    })

    expect(capturedRequest.url).toBe(CHECK_BOUNDARY_URL)
    expect(capturedRequest.method).toBe('POST')
    expect(capturedRequest.headers.get('x-cdp-request-id')).toBe('trace-789')

    const uploaded = (await capturedRequest.formData()).get('geometry_file')
    expect(uploaded).toBeInstanceOf(File)
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

    mockCheckBoundary(() =>
      HttpResponse.json(
        {
          error: 'Invalid geometry',
          boundaryGeometryOriginal: mockReturnedOriginalGeometry,
          boundaryGeometryWgs84: mockReturnedWgs84Geometry
        },
        { status: statusCodes.badRequest }
      )
    )

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      error: 'Invalid geometry',
      statusCode: statusCodes.badRequest,
      boundaryGeometryOriginal: mockReturnedOriginalGeometry,
      boundaryGeometryWgs84: mockReturnedWgs84Geometry
    })
  })

  it('should return error on network failure', async () => {
    mockCheckBoundary(() => HttpResponse.error())

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result).toEqual({
      error: 'impact_assessor_unreachable'
    })
  })

  it('should return error when intersectingEdps is missing from the response', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({
        boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
        boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] }
      })
    )

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingEdps is not an array', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({
        boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
        boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
        intersectingEdps: null
      })
    )

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingExcludedAreas is missing from the response', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({
        boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
        boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
        intersectingEdps: []
      })
    )

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingExcludedAreas is not an array', async () => {
    mockCheckBoundary(() =>
      HttpResponse.json({
        boundaryGeometryOriginal: { type: 'Polygon', coordinates: [] },
        boundaryGeometryWgs84: { type: 'Polygon', coordinates: [] },
        intersectingEdps: [],
        intersectingExcludedAreas: 'not-an-array'
      })
    )

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when the response body is unexpected JSON', async () => {
    mockCheckBoundary(() => HttpResponse.json({ status: 'ok' }))

    const result = await checkBoundaryGeometry(mockGeometry)

    expect(result.error).toBeDefined()
    expect(result.geojson).toBeUndefined()
  })

  it('should return error when intersectingEdps is present but geometry fields are missing', async () => {
    mockCheckBoundary(() => HttpResponse.json({ intersectingEdps: [] }))

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

    let capturedRequest
    mockCheckBoundary(({ request }) => {
      capturedRequest = request
      return HttpResponse.json({
        boundaryGeometryOriginal: {},
        boundaryGeometryWgs84: {},
        intersectingEdps: [],
        intersectingExcludedAreas: []
      })
    })

    await checkBoundaryGeometry(featureCollection)

    const uploaded = (await capturedRequest.formData()).get('geometry_file')
    expect(JSON.parse(await uploaded.text())).toEqual(featureCollection)
  })

  it('should wrap a Feature input in a FeatureCollection', async () => {
    const feature = {
      type: 'Feature',
      geometry: mockGeometry,
      properties: { name: 'site-b' }
    }

    let capturedRequest
    mockCheckBoundary(({ request }) => {
      capturedRequest = request
      return HttpResponse.json({
        boundaryGeometryOriginal: {},
        boundaryGeometryWgs84: {},
        intersectingEdps: [],
        intersectingExcludedAreas: []
      })
    })

    await checkBoundaryGeometry(feature)

    const uploaded = (await capturedRequest.formData()).get('geometry_file')
    expect(JSON.parse(await uploaded.text())).toEqual({
      type: 'FeatureCollection',
      features: [feature]
    })
  })
})
