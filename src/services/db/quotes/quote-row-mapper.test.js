import { mapQuoteRows } from './quote-row-mapper.js'

const baseRow = {
  id: 1,
  reference: 'NRF-000001',
  user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  created_at: '2026-03-23T00:00:00.000Z',
  residential_building_count: 10,
  boundary_geodata: '{"type":"Polygon"}',
  boundary_entry_type: 'upload',
  boundary_filename: 'site-boundary.shp',
  email_address: 'developer@housebuilder.com',
  email_send_request_at: null
}

describe('mapQuoteRows', () => {
  it('returns mapped quote with EDPs when given populated rows', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: 'EDP-001',
        edp_name: 'Test EDP',
        edp_type: 'flood',
        impact: { score: 1 },
        levy_gbp_min: 100,
        levy_gbp_max: 200
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result).toEqual({
      id: 1,
      reference: 'NRF-000001',
      userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      createdAt: '2026-03-23T00:00:00.000Z',
      planningType: undefined,
      housingUnits: 10,
      boundary: {
        geoJsonWgs84: '{"type":"Polygon"}',
        userInputType: 'upload',
        filename: 'site-boundary.shp'
      },
      email: {
        address: 'developer@housebuilder.com',
        sendRequestAt: null
      },
      disableAnalyticsAudit: false,
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

  it('returns mapped quote with empty edps when edp_id is null', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: null,
        edp_name: null,
        edp_type: null,
        impact: null,
        levy_gbp_min: null,
        levy_gbp_max: null
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result.edps).toEqual([])
    expect(result.levyGbp).toBeNull()
  })

  it('returns null when rows array is empty', () => {
    expect(mapQuoteRows([])).toBeNull()
  })

  it('maps multiple EDP rows for the same quote correctly', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: 'EDP-001',
        edp_name: 'First EDP',
        edp_type: 'flood',
        impact: { nitrogenBand: 'low' },
        levy_gbp_min: 100,
        levy_gbp_max: 200
      },
      {
        ...baseRow,
        edp_id: 'EDP-002',
        edp_name: 'Second EDP',
        edp_type: 'phosphorus',
        impact: { phosphorusBand: 'high' },
        levy_gbp_min: 300,
        levy_gbp_max: 400
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result.edps).toHaveLength(2)
    expect(result.edps[0]).toMatchObject({
      edpId: 'EDP-001',
      edpName: 'First EDP'
    })
    expect(result.edps[1]).toMatchObject({
      edpId: 'EDP-002',
      edpName: 'Second EDP'
    })
  })
})
