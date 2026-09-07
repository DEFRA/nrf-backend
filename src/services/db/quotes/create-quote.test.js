import { dbCreateQuote } from './create-quote.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-23T00:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dbCreateQuote', () => {
  const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  const mockQuoteRow = { id: 1, reference: 'NRL-000001' }

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
    intersectingEdps: [
      {
        label: 'River Wensum SAC EDP',
        catchments: [{ label: 'Broads SAC', catchmentOverlapPercentage: 67.4 }]
      }
    ]
  }

  const mockDb = () => ({
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: mockUserId, created: true }] })
      .mockResolvedValueOnce({ rows: [mockQuoteRow] })
      .mockResolvedValueOnce({ rowCount: 1 })
  })

  const quoteData = {
    planningType: 'full-planning-permission',
    email: 'developer@housebuilder.com',
    boundaryEntryType: 'draw',
    boundaryGeojson: mockBoundaryGeojson,
    housingUnits: 10
  }

  it('should create a new user and insert quote with all fields', async () => {
    const db = mockDb()

    const result = await dbCreateQuote({
      db,
      quoteData: {
        planningType: 'full-planning-permission',
        email: 'developer@housebuilder.com',
        boundaryEntryType: 'upload',
        boundaryGeojson: mockBoundaryGeojson,
        boundaryFilename: 'site-boundary.shp',
        housingUnits: 10
      }
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      ['developer@housebuilder.com']
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quotes'),
      [
        mockUserId,
        'full-planning-permission',
        'upload',
        JSON.stringify(mockBoundaryGeojson.boundaryGeometryOriginal),
        27700,
        'site-boundary.shp',
        10,
        false,
        '2026-03-23T00:00:00.000Z'
      ]
    )
    expect(result).toEqual({
      ...mockQuoteRow,
      userId: mockUserId,
      userCreated: true
    })
  })

  it('should pass null for boundaryFilename when not provided', async () => {
    const db = mockDb()

    await dbCreateQuote({
      db,
      quoteData: {
        planningType: 'full-planning-permission',
        email: 'developer@housebuilder.com',
        boundaryEntryType: 'draw',
        boundaryGeojson: mockBoundaryGeojson,
        housingUnits: 10
      }
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quotes'),
      [
        mockUserId,
        'full-planning-permission',
        'draw',
        JSON.stringify(mockBoundaryGeojson.boundaryGeometryOriginal),
        27700,
        null,
        10,
        false,
        '2026-03-23T00:00:00.000Z'
      ]
    )
  })

  it('should default CRS to 4326 when not present in geometry', async () => {
    const db = mockDb()
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
        housingUnits: 10
      }
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quotes'),
      expect.arrayContaining([4326])
    )
  })

  it('inserts placeholder EDP results for the intersecting EDPs', async () => {
    const db = mockDb()

    await dbCreateQuote({ db, quoteData })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quote_edp_results'),
      expect.arrayContaining(['River Wensum SAC EDP'])
    )
  })

  it('still returns the created quote when the placeholder insert fails', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: mockUserId, created: true }] })
        .mockResolvedValueOnce({ rows: [mockQuoteRow] })
        .mockRejectedValueOnce(new Error('placeholder insert failed'))
    }

    const result = await dbCreateQuote({ db, quoteData })

    expect(result.reference).toBe('NRL-000001')
  })

  it('skips intersecting EDPs with no label, which cannot be matched later', async () => {
    const db = mockDb()

    await dbCreateQuote({
      db,
      quoteData: {
        ...quoteData,
        boundaryGeojson: {
          ...mockBoundaryGeojson,
          intersectingEdps: [{ label: null, catchments: [] }]
        }
      }
    })

    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quote_edp_results'),
      expect.anything()
    )
  })
})
