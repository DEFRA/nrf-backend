import {
  dbSaveEdpResults,
  dbGetEdpResults,
  dbUpdateEdpResult
} from './queries.js'

describe('dbSaveEdpResults', () => {
  const edps = [
    {
      edpId: 123,
      edpName: 'Norfolk Fens east',
      edpType: 'NUTRIENT',
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
      levyGbp: { min: 100, max: 200 }
    }
  ]

  it('should delete existing records for the quoteId before inserting', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbSaveEdpResults({ db, quoteId: 1, edps })

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM quote_edp_results WHERE quote_id = $1',
      [1]
    )
  })

  it('should insert a row for each EDP', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbSaveEdpResults({ db, quoteId: 1, edps })

    expect(db.query).toHaveBeenCalledTimes(2)
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quote_edp_results'),
      [
        1,
        123,
        'Norfolk Fens east',
        'NUTRIENT',
        JSON.stringify(edps[0].impact),
        100,
        200
      ]
    )
  })

  it('should insert a row for each EDP when multiple are provided', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const multipleEdps = [
      ...edps,
      {
        edpId: 456,
        edpName: 'Broads west',
        edpType: 'BIODIVERSITY',
        impact: {
          nitrogenTotal: {
            amount: 10,
            unit: 'mg/I TP',
            band: { min: 1, max: 1 }
          },
          phosphorusTotal: {
            amount: 5,
            unit: 'mg/I TP',
            band: { min: 1, max: 1 }
          }
        },
        levyGbp: { min: 200, max: 300 }
      }
    ]

    await dbSaveEdpResults({ db, quoteId: 2, edps: multipleEdps })

    expect(db.query).toHaveBeenCalledTimes(3) // 1 delete + 2 inserts
  })
})

describe('dbGetEdpResults', () => {
  it('should query quote_edp_results by quoteId and return rows', async () => {
    const mockRows = [{ edp_id: 123, edp_name: 'Norfolk Fens east' }]
    const db = { query: vi.fn().mockResolvedValue({ rows: mockRows }) }

    const result = await dbGetEdpResults({ db, quoteId: 1 })

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM quote_edp_results WHERE quote_id = $1',
      [1]
    )
    expect(result).toEqual(mockRows)
  })
})

describe('dbUpdateEdpResult', () => {
  it('should update the matching record by quoteId and edpId', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const edp = {
      edpName: 'Updated Name',
      edpType: 'NUTRIENT',
      impact: { nitrogenTotal: { amount: 90 } },
      levyGbp: { min: 150, max: 250 }
    }

    await dbUpdateEdpResult({ db, quoteId: 1, edpId: 123, edp })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE quote_edp_results'),
      [
        'Updated Name',
        'NUTRIENT',
        JSON.stringify({ nitrogenTotal: { amount: 90 } }),
        150,
        250,
        1,
        123
      ]
    )
  })
})
