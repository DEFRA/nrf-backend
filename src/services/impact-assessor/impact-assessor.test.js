import { checkBoundary } from './impact-assessor.js'

describe('impact-assessor service', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('checkBoundary', () => {
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

    it('should return error on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ detail: 'Unsupported file format: .txt' })
      })

      const result = await checkBoundary(
        Buffer.from('test'),
        'test.txt',
        'text/plain'
      )

      expect(result).toEqual({
        error: 'Unsupported file format: .txt',
        statusCode: 400
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
})
