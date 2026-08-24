import { dbGetAllQuotes } from './get-all-quotes.js'

const makeRow = (overrides = {}) => ({
  id: 1,
  reference: 'NRL-000001',
  created_at: '2026-03-23T00:00:00.000Z',
  development_types: ['housing'],
  residential_building_count: 10,
  people_count: null,
  boundary_geodata: '{"type":"Polygon"}',
  boundary_entry_type: 'upload',
  boundary_filename: 'site-boundary.shp',
  email_address: 'developer@housebuilder.com',
  edp_id: null,
  edp_name: null,
  edp_type: null,
  impact: null,
  levy_gbp_min: null,
  levy_gbp_max: null,
  ...overrides
})

describe('dbGetAllQuotes', () => {
  it('returns empty array when no quotes', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    const result = await dbGetAllQuotes({ db })

    expect(result).toEqual([])
  })

  it('returns single quote with no EDPs', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [makeRow()] }) }

    const result = await dbGetAllQuotes({ db })

    expect(result).toHaveLength(1)
    expect(result[0].reference).toBe('NRL-000001')
    expect(result[0].edps).toEqual([])
  })

  it('returns single quote with multiple EDPs', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          makeRow({
            edp_id: 'EDP-001',
            edp_name: 'First EDP',
            edp_type: 'flood',
            impact: { score: 1 },
            levy_gbp_min: 100,
            levy_gbp_max: 200
          }),
          makeRow({
            edp_id: 'EDP-002',
            edp_name: 'Second EDP',
            edp_type: 'phosphorus',
            impact: { score: 2 },
            levy_gbp_min: 300,
            levy_gbp_max: 400
          })
        ]
      })
    }

    const result = await dbGetAllQuotes({ db })

    expect(result).toHaveLength(1)
    expect(result[0].edps).toHaveLength(2)
    expect(result[0].edps[0]).toMatchObject({ edpId: 'EDP-001' })
    expect(result[0].edps[1]).toMatchObject({ edpId: 'EDP-002' })
  })

  it('returns null boundary geodata rather than failing when the row has an unrecognised SRID', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [makeRow({ boundary_geodata: null })]
      })
    }

    const result = await dbGetAllQuotes({ db })

    expect(result[0].boundary.geoJsonWgs84).toBeNull()
  })

  it('returns multiple quotes', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          makeRow({ id: 1, reference: 'NRL-000001' }),
          makeRow({
            id: 2,
            reference: 'NRL-000002',
            created_at: '2026-03-24T00:00:00.000Z'
          })
        ]
      })
    }

    const result = await dbGetAllQuotes({ db })

    expect(result).toHaveLength(2)
    expect(result[0].reference).toBe('NRL-000001')
    expect(result[1].reference).toBe('NRL-000002')
  })
})
