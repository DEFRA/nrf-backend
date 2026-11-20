import { saveOrUpdateEdpResults } from './save-or-update-edp-results.js'
import {
  dbSaveEdpResults,
  dbGetEdpResults
} from '../../../services/db/quote_edp_results/queries.js'

import { levyCalculationHistory } from '../../../test-utils/fixtures/quotePayloads.js'

vi.mock('../../../services/db/quote_edp_results/queries.js')
const edp = {
  edpId: 123,
  edpName: 'Norfolk Fens east',
  edpStartDate: '2026-01-01',
  impact: {
    nitrogenTotal: { amount: 80, unit: 'mg/I TP', band: { min: 1, max: 3 } },
    phosphorusTotal: { amount: 60, unit: 'mg/I TP', band: { min: 1, max: 4 } }
  },
  catchments: [
    {
      label: 'Broads SAC',
      catchmentId: '27',
      catchmentOverlapPercentage: 67.4
    }
  ],
  levyGbp: {
    amountExcludingVat: 1100,
    amountInflationAdjusted: 1122,
    baseAmount: 1000,
    modelVersion: 1,
    ...levyCalculationHistory
  }
}

const existingRow = {
  edp_id: 123,
  edp_name: 'Norfolk Fens east',
  edp_start_date_text: '2026-01-01',
  impact: edp.impact,
  catchments: edp.catchments,
  levy_provisional_amount: '1000.00',
  levy_inflation_adjusted: '1122.00',
  levy_model_version: 1,
  levy_calculated_at: new Date(levyCalculationHistory.calculationDate),
  levy_base_charge_per_unit: '2675.00',
  levy_units: 10,
  levy_original_base_amount: '26750.00',
  levy_original_base_charge_per_unit: '2675.00'
}

const db = {}

describe('saveOrUpdateEdpResults', () => {
  describe('when no existing records exist', () => {
    beforeEach(() => {
      vi.mocked(dbGetEdpResults).mockResolvedValue([])
      vi.mocked(dbSaveEdpResults).mockResolvedValue(1)
    })

    it('saves all EDPs and returns true when rows are inserted', async () => {
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [edp]
      })

      expect(dbSaveEdpResults).toHaveBeenCalledWith({
        db,
        quoteId: 1,
        edps: [edp]
      })
      expect(result).toBe(true)
    })

    it('returns false when a concurrent duplicate inserts no rows', async () => {
      vi.mocked(dbSaveEdpResults).mockResolvedValue(0)

      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [edp]
      })

      expect(result).toBe(false)
    })
  })

  describe('when existing records exist', () => {
    beforeEach(() => {
      vi.mocked(dbGetEdpResults).mockResolvedValue([existingRow])
      vi.mocked(dbSaveEdpResults).mockImplementation(
        async ({ edps }) => edps.length
      )
    })

    it('returns false when no fields have changed', async () => {
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [edp]
      })

      expect(dbSaveEdpResults).toHaveBeenCalledWith({
        db,
        quoteId: 1,
        edps: []
      })
      expect(result).toBe(false)
    })

    it('appends a history row and returns true when edpName changes', async () => {
      const updated = { ...edp, edpName: 'New Name' }
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [updated]
      })

      expect(dbSaveEdpResults).toHaveBeenCalledWith({
        db,
        quoteId: 1,
        edps: [updated]
      })
      expect(result).toBe(true)
    })

    it('appends a history row and returns true when edpStartDate changes', async () => {
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [{ ...edp, edpStartDate: '2027-01-01' }]
      })

      expect(dbSaveEdpResults).toHaveBeenCalledWith(
        expect.objectContaining({ edps: [expect.any(Object)] })
      )
      expect(result).toBe(true)
    })

    it.each([
      ['amountInflationAdjusted', 250],
      ['baseAmount', 350],
      ['modelVersion', 2],
      ['calculationDate', '2026-10-01T09:00:00.000Z'],
      ['baseChargePerUnit', 2700],
      ['units', 11],
      ['originalBaseAmount', 27000],
      ['originalBaseChargePerUnit', 2700]
    ])(
      'appends a history row and returns true when %s changes',
      async (field, value) => {
        const updated = { ...edp, levyGbp: { ...edp.levyGbp, [field]: value } }
        const result = await saveOrUpdateEdpResults({
          db,
          quoteId: 1,
          edps: [updated]
        })

        expect(dbSaveEdpResults).toHaveBeenCalledWith(
          expect.objectContaining({ edps: [expect.any(Object)] })
        )
        expect(result).toBe(true)
      }
    )

    it('appends a history row and returns true when impact changes', async () => {
      const updated = {
        ...edp,
        impact: {
          ...edp.impact,
          nitrogenTotal: { ...edp.impact.nitrogenTotal, amount: 99 }
        }
      }
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [updated]
      })

      expect(dbSaveEdpResults).toHaveBeenCalledWith(
        expect.objectContaining({ edps: [expect.any(Object)] })
      )
      expect(result).toBe(true)
    })

    it('appends a history row and returns true when catchments change', async () => {
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [
          {
            ...edp,
            catchments: [
              {
                label: 'River Wensum SAC',
                catchmentId: '29',
                catchmentOverlapPercentage: 32.6
              }
            ]
          }
        ]
      })

      expect(dbSaveEdpResults).toHaveBeenCalledWith(
        expect.objectContaining({ edps: [expect.any(Object)] })
      )
      expect(result).toBe(true)
    })

    it('returns false when a row without catchments gets a payload without catchments', async () => {
      vi.mocked(dbGetEdpResults).mockResolvedValue([
        { ...existingRow, catchments: null }
      ])
      const { catchments: _, ...edpWithoutCatchments } = edp

      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [edpWithoutCatchments]
      })

      expect(dbSaveEdpResults).toHaveBeenCalledWith({
        db,
        quoteId: 1,
        edps: []
      })
      expect(result).toBe(false)
    })

    it('appends a history row for an EDP seen for the first time, leaving unchanged EDPs alone', async () => {
      const newEdp = { ...edp, edpId: 999 }
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [edp, newEdp]
      })

      expect(dbSaveEdpResults).toHaveBeenCalledWith({
        db,
        quoteId: 1,
        edps: [newEdp]
      })
      expect(result).toBe(true)
    })
  })
})
