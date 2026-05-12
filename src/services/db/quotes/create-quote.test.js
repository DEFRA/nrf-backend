import { dbCreateQuote } from './create-quote.js'

const mockGetCurrentISODateTime = vi.hoisted(() =>
  vi.fn().mockReturnValue('2026-03-23T00:00:00.000Z')
)

vi.mock('../../../common/helpers/date-time.js', () => ({
  getCurrentISODateTime: mockGetCurrentISODateTime
}))

beforeEach(() => {
  mockGetCurrentISODateTime.mockReturnValue('2026-03-23T00:00:00.000Z')
})

describe('dbCreateQuote', () => {
  const mockRow = { id: 1, reference: 'NRF-000001' }

  const mockBoundaryGeojson = {
    boundaryGeometryOriginal: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0]
        ]
      ],
      crs: { properties: { name: 'urn:ogc:def:crs:EPSG::27700' } }
    },
    intersectingEdps: ['EDP-001']
  }

  it('should insert a new quote with all fields and return it', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    const result = await dbCreateQuote({
      db,
      quoteData: {
        email: 'developer@housebuilder.com',
        boundaryEntryType: 'upload',
        boundaryGeojson: mockBoundaryGeojson,
        boundaryFilename: 'site-boundary.shp',
        developmentTypes: ['housing'],
        residentialBuildingCount: 10,
        wasteWaterTreatmentWorksId: '101',
        wasteWaterTreatmentWorksName: 'Great Billing WRC',
        peopleCount: undefined
      }
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quotes'),
      [
        'developer@housebuilder.com',
        'upload',
        JSON.stringify(mockBoundaryGeojson.boundaryGeometryOriginal),
        27700,
        'site-boundary.shp',
        ['housing'],
        10,
        null,
        '101',
        'Great Billing WRC',
        '2026-03-23T00:00:00.000Z'
      ]
    )
    expect(result).toEqual(mockRow)
  })

  it('should pass null for optional fields when not provided', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    await dbCreateQuote({
      db,
      quoteData: {
        email: 'developer@housebuilder.com',
        boundaryEntryType: 'draw',
        boundaryGeojson: mockBoundaryGeojson,
        developmentTypes: ['other-residential'],
        peopleCount: 5
      }
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quotes'),
      [
        'developer@housebuilder.com',
        'draw',
        JSON.stringify(mockBoundaryGeojson.boundaryGeometryOriginal),
        27700,
        null,
        ['other-residential'],
        null,
        5,
        null,
        null,
        '2026-03-23T00:00:00.000Z'
      ]
    )
  })

  it('should default CRS to 4326 when not present in geometry', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }
    const geojsonNoCrs = {
      boundaryGeometryOriginal: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0]
          ]
        ]
      },
      intersectingEdps: []
    }

    await dbCreateQuote({
      db,
      quoteData: {
        email: 'developer@housebuilder.com',
        boundaryEntryType: 'draw',
        boundaryGeojson: geojsonNoCrs,
        developmentTypes: ['housing']
      }
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quotes'),
      expect.arrayContaining([4326])
    )
  })
})
