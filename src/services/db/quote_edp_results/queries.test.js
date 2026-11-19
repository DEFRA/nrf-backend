import {
  dbSaveEdpResults,
  dbGetEdpResults,
  dbSaveLevyCalculation
} from './queries.js'

const calculation = {
  calculationDate: '2026-09-14T10:30:15.000Z',
  originalBaseAmount: 26750,
  baseChargePerUnit: 2675,
  originalBaseChargePerUnit: 2675,
  units: 10
}

// The values a calculation contributes to a row, in insert order
const calculationParams = ['2026-09-14T10:30:15.000Z', 2675, 10, 26750, 2675]

describe('dbSaveEdpResults', () => {
  const edps = [
    {
      edpId: 123,
      edpName: 'Norfolk Fens east',
      edpStartDate: '2026-01-01',
      impact: {
        nitrogenTotal: {
          amount: 80,
          unit: 'mg/I TP',
          band: { min: 1, max: 3 }
        },
        phosphorusTotal: {
          amount: 60,
          unit: 'mg/I TP',
          band: { min: 1, max: 4 }
        }
      },
      catchments: [
        {
          label: 'Broads SAC',
          catchmentId: '27',
          catchmentOverlapPercentage: 67.4
        },
        {
          label: 'River Wensum SAC',
          catchmentId: '29',
          catchmentOverlapPercentage: 32.6
        }
      ],
      levyGbp: {
        amountExcludingVat: 1100,
        amountInflationAdjusted: 1122,
        baseAmount: 1000,
        modelVersion: 1,
        ...calculation
      }
    }
  ]

  const broadsWestEdp = {
    edpId: 456,
    edpName: 'Broads west',
    edpStartDate: '2026-02-01',
    impact: {
      nitrogenTotal: { amount: 10, unit: 'mg/I TP', band: { min: 1, max: 1 } },
      phosphorusTotal: { amount: 5, unit: 'mg/I TP', band: { min: 1, max: 1 } }
    },
    levyGbp: {
      amountExcludingVat: 2100,
      amountInflationAdjusted: 2122,
      baseAmount: 2000,
      modelVersion: 1,
      ...calculation
    }
  }

  it('should insert all EDPs in a single statement as new history rows', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) }

    await dbSaveEdpResults({ db, quoteId: 1, edps })

    expect(db.query).toHaveBeenCalledTimes(1)
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('INSERT INTO quote_edp_results')
    expect(sql).toContain('catchments')
    expect(sql).not.toContain('ON CONFLICT')
    expect(params).toEqual([
      1,
      123,
      'Norfolk Fens east',
      '2026-01-01',
      JSON.stringify(edps[0].impact),
      JSON.stringify(edps[0].catchments),
      1000,
      1122,
      1,
      ...calculationParams,
      'quote'
    ])
  })

  it('should parameterise every EDP when multiple are provided', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 2 }) }
    const multipleEdps = [...edps, broadsWestEdp]

    await dbSaveEdpResults({ db, quoteId: 2, edps: multipleEdps })

    expect(db.query).toHaveBeenCalledTimes(1)
    const [, params] = db.query.mock.calls[0]
    expect(params).toEqual([
      2,
      123,
      'Norfolk Fens east',
      '2026-01-01',
      JSON.stringify(edps[0].impact),
      JSON.stringify(edps[0].catchments),
      1000,
      1122,
      1,
      ...calculationParams,
      'quote',
      2,
      456,
      'Broads west',
      '2026-02-01',
      JSON.stringify(broadsWestEdp.impact),
      null,

      2000,
      2122,
      1,
      ...calculationParams,
      'quote'
    ])
  })

  it('should return the number of rows inserted', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) }

    const inserted = await dbSaveEdpResults({ db, quoteId: 1, edps })

    expect(inserted).toBe(1)
  })

  it('should return zero without querying when there are no EDPs', async () => {
    const db = { query: vi.fn() }

    const inserted = await dbSaveEdpResults({ db, quoteId: 1, edps: [] })

    expect(inserted).toBe(0)
    expect(db.query).not.toHaveBeenCalled()
  })
})

describe('dbGetEdpResults', () => {
  it('should return the last created row for each EDP of the quote', async () => {
    const mockRows = [{ edp_id: 123, edp_name: 'Norfolk Fens east' }]
    const db = { query: vi.fn().mockResolvedValue({ rows: mockRows }) }

    const result = await dbGetEdpResults({ db, quoteId: 1 })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('DISTINCT ON (edp_id)')
    expect(sql).toContain('ORDER BY edp_id, created_at DESC, id DESC')
    expect(params).toEqual([1])
    expect(result).toEqual(mockRows)
  })
})

describe('dbSaveEdpResults history fields', () => {
  it('should store the levy calculation fields and the journey', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) }
    const edp = {
      edpId: 123,
      edpName: 'Norfolk Fens east',
      edpStartDate: '2026-01-01',
      impact: {},
      levyGbp: {
        amountExcludingVat: 26750,
        amountInflationAdjusted: 26750,
        baseAmount: 26750,
        modelVersion: 1,
        ...calculation,
        calculationDate: new Date('2026-09-14T10:30:15Z')
      }
    }

    await dbSaveEdpResults({ db, quoteId: 1, edps: [edp] })

    expect(db.query.mock.calls[0][1].slice(9)).toEqual([
      new Date('2026-09-14T10:30:15Z'),
      2675,
      10,
      26750,
      2675,
      'quote'
    ])
  })
})

describe('dbSaveLevyCalculation', () => {
  const levy = {
    provisionalAmount: 26750,
    inflationAdjustedAmount: 26750,
    calculatorVersion: 1,
    ...calculation,
    calculationDate: '2026-11-17T10:30:15.000Z'
  }

  it('should copy the latest row of each EDP with the levy calculation replaced', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) }

    const inserted = await dbSaveLevyCalculation({
      db,
      quoteId: 7,
      journey: 'request_to_use',
      levy
    })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('INSERT INTO quote_edp_results')
    expect(sql).toContain('SELECT DISTINCT ON (edp_id)')
    expect(params).toEqual([
      7,
      26750,
      26750,
      1,
      '2026-11-17T10:30:15.000Z',
      2675,
      10,
      26750,
      2675,
      'request_to_use'
    ])
    expect(inserted).toBe(1)
  })
})
