import { dbGetQuote } from './get-quote.js'

describe('dbGetQuote', () => {
  it('should return the mapped quote with edps when found', async () => {
    const mockRow = {
      id: 1,
      reference: 'NRF-000001',
      user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      created_at: '2026-03-23T00:00:00.000Z',
      development_types: ['housing'],
      residential_building_count: 10,
      people_count: null,
      boundary_geodata: '{"type":"Polygon"}',
      boundary_entry_type: 'upload',
      boundary_filename: 'site-boundary.shp',
      waste_water_treatment_works_id: '101',
      waste_water_treatment_works_name: 'Great Billing WRC',
      email_address: 'developer@housebuilder.com',
      email_send_request_at: null,
      edp_id: 'EDP-001',
      edp_name: 'Test EDP',
      edp_type: 'flood',
      impact: { score: 1 },
      levy_gbp_min: 100,
      levy_gbp_max: 200
    }
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    const result = await dbGetQuote({ db, reference: 'NRF-000001' })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN quote_edp_results'),
      ['NRF-000001']
    )
    expect(result).toEqual({
      id: 1,
      reference: 'NRF-000001',
      userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      createdAt: '2026-03-23T00:00:00.000Z',
      development: {
        types: ['housing'],
        residentialBuildingCount: 10,
        peopleCount: null
      },
      boundary: {
        geoJsonWgs84: '{"type":"Polygon"}',
        userInputType: 'upload',
        filename: 'site-boundary.shp'
      },
      wasteWaterTreatmentWorksId: '101',
      wasteWaterTreatmentWorksName: 'Great Billing WRC',
      email: {
        address: 'developer@housebuilder.com',
        sendRequestAt: null
      },
      edps: [
        {
          edpId: 'EDP-001',
          edpName: 'Test EDP',
          edpType: 'flood',
          impact: { score: 1 },
          levyGbp: { min: 100, max: 200 }
        }
      ],
      levyGbp: '£100 - £200'
    })
  })

  it('should return the quote with empty edps when no edp results exist', async () => {
    const mockRow = {
      id: 1,
      reference: 'NRF-000001',
      user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      created_at: '2026-03-23T00:00:00.000Z',
      development_types: ['housing'],
      residential_building_count: null,
      people_count: null,
      boundary_geodata: '{"type":"Polygon"}',
      boundary_entry_type: 'draw',
      email_address: 'developer@housebuilder.com',
      email_send_request_at: null,
      edp_id: null,
      edp_name: null,
      edp_type: null,
      impact: null,
      levy_gbp_min: null,
      levy_gbp_max: null
    }
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    const result = await dbGetQuote({ db, reference: 'NRF-000001' })

    expect(result.edps).toEqual([])
  })

  it('should return null when the quote is not found', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    const result = await dbGetQuote({ db, reference: 'NRF-000001' })

    expect(result).toBeNull()
  })
})
