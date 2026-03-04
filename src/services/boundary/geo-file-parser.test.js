import { parseBoundaryFile } from './geo-file-parser.js'

vi.mock('shpjs')

const mockParseFromString = vi.fn()
const mockKml = vi.fn()

vi.mock('@xmldom/xmldom', () => ({
  DOMParser: class {
    parseFromString (...args) {
      return mockParseFromString(...args)
    }
  }
}))

vi.mock('@mapbox/togeojson', () => ({
  default: { kml: (...args) => mockKml(...args) }
}))

const polygon = {
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

describe('parseBoundaryFile', () => {
  describe('GeoJSON parsing', () => {
    it('should extract geometry from a FeatureCollection', async () => {
      const input = JSON.stringify({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: polygon }]
      })

      const result = await parseBoundaryFile('file.geojson', input)

      expect(result).toEqual(polygon)
    })

    it('should extract geometry from a Feature', async () => {
      const input = JSON.stringify({ type: 'Feature', geometry: polygon })

      const result = await parseBoundaryFile('file.geojson', input)

      expect(result).toEqual(polygon)
    })

    it('should return raw geometry object', async () => {
      const input = JSON.stringify(polygon)

      const result = await parseBoundaryFile('file.json', input)

      expect(result).toEqual(polygon)
    })

    it('should handle Buffer input', async () => {
      const input = Buffer.from(
        JSON.stringify({ type: 'Feature', geometry: polygon })
      )

      const result = await parseBoundaryFile('file.geojson', input)

      expect(result).toEqual(polygon)
    })

    it('should throw when FeatureCollection has no features', async () => {
      const input = JSON.stringify({
        type: 'FeatureCollection',
        features: []
      })

      await expect(
        parseBoundaryFile('file.geojson', input)
      ).rejects.toThrow('GeoJSON FeatureCollection contains no features')
    })

    it('should dispatch .json extension', async () => {
      const input = JSON.stringify({ type: 'Feature', geometry: polygon })

      const result = await parseBoundaryFile('uploads/file.json', input)

      expect(result).toEqual(polygon)
    })
  })

  describe('Shapefile parsing', () => {
    it('should extract geometry from shapefile result', async () => {
      const { default: shpjs } = await import('shpjs')
      vi.mocked(shpjs).mockResolvedValue({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: polygon }]
      })

      const result = await parseBoundaryFile(
        'file.zip',
        Buffer.from('fake-zip')
      )

      expect(result).toEqual(polygon)
      expect(shpjs).toHaveBeenCalledWith(Buffer.from('fake-zip'))
    })

    it('should handle array result from multi-layer shapefile', async () => {
      const { default: shpjs } = await import('shpjs')
      vi.mocked(shpjs).mockResolvedValue([
        {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: polygon }]
        }
      ])

      const result = await parseBoundaryFile(
        'file.zip',
        Buffer.from('fake-zip')
      )

      expect(result).toEqual(polygon)
    })

    it('should throw when shapefile has no features', async () => {
      const { default: shpjs } = await import('shpjs')
      vi.mocked(shpjs).mockResolvedValue({
        type: 'FeatureCollection',
        features: []
      })

      await expect(
        parseBoundaryFile('file.zip', Buffer.from('fake-zip'))
      ).rejects.toThrow('Shapefile contains no features')
    })
  })

  describe('KML parsing', () => {
    it('should extract geometry from KML', async () => {
      const mockDom = { documentElement: {} }
      mockParseFromString.mockReturnValue(mockDom)
      mockKml.mockReturnValue({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: polygon }]
      })

      const result = await parseBoundaryFile('file.kml', '<kml>test</kml>')

      expect(result).toEqual(polygon)
      expect(mockKml).toHaveBeenCalledWith(mockDom)
    })

    it('should handle Buffer input', async () => {
      const mockDom = { documentElement: {} }
      mockParseFromString.mockReturnValue(mockDom)
      mockKml.mockReturnValue({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: polygon }]
      })

      const result = await parseBoundaryFile(
        'file.kml',
        Buffer.from('<kml>test</kml>')
      )

      expect(result).toEqual(polygon)
    })

    it('should throw when KML has no features', async () => {
      const mockDom = { documentElement: {} }
      mockParseFromString.mockReturnValue(mockDom)
      mockKml.mockReturnValue({
        type: 'FeatureCollection',
        features: []
      })

      await expect(
        parseBoundaryFile('file.kml', '<kml>empty</kml>')
      ).rejects.toThrow('KML contains no features')
    })
  })

  describe('unsupported format', () => {
    it('should throw on unsupported extension', async () => {
      await expect(
        parseBoundaryFile('file.txt', 'contents')
      ).rejects.toThrow('Unsupported file format: .txt')
    })
  })
})
