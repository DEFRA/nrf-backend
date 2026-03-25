import { dbSaveEdpResults } from './queries.js'

describe('dbSaveEdpResults', () => {
  const edps = [
    {
      edpId: 123,
      edpName: 'Norfolk Fens east',
      edpType: 'NUTRIENT',
      impact: {
        nitrogenTotal: { amount: 80, unit: 'mg/I TP', band: 3 },
        phosphorusTotal: { amount: 60, unit: 'mg/I TP', band: 4 }
      },
      levyGbp: 100
    }
  ]

  it('should insert a row for each EDP', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbSaveEdpResults({ db, quoteId: 1, edps })

    expect(db.query).toHaveBeenCalledTimes(1)
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quote_edp_results'),
      [
        1,
        123,
        'Norfolk Fens east',
        'NUTRIENT',
        JSON.stringify(edps[0].impact),
        100
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
          nitrogenTotal: { amount: 10, unit: 'mg/I TP', band: 1 },
          phosphorusTotal: { amount: 5, unit: 'mg/I TP', band: 1 }
        },
        levyGbp: 200
      }
    ]

    await dbSaveEdpResults({ db, quoteId: 2, edps: multipleEdps })

    expect(db.query).toHaveBeenCalledTimes(2)
  })
})
