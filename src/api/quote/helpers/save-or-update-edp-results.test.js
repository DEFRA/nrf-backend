import { saveOrUpdateEdpResults } from './save-or-update-edp-results.js'
import {
  dbSaveEdpResults,
  dbGetEdpResults,
  dbUpdateEdpResult
} from '../../../services/db/quote_edp_results/queries.js'

vi.mock('../../../services/db/quote_edp_results/queries.js')
const edp = {
  edpId: 123,
  edpName: 'Norfolk Fens east',
  edpType: 'NUTRIENT',
  impact: {
    nitrogenTotal: { amount: 80, unit: 'mg/I TP', band: { min: 1, max: 3 } },
    phosphorusTotal: { amount: 60, unit: 'mg/I TP', band: { min: 1, max: 4 } }
  },
  levyGbp: { min: 100, max: 200 }
}

const existingRow = {
  edp_id: 123,
  edp_name: 'Norfolk Fens east',
  edp_type: 'NUTRIENT',
  impact: edp.impact,
  levy_gbp_min: '100.00',
  levy_gbp_max: '200.00'
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
      vi.mocked(dbUpdateEdpResult).mockResolvedValue()
    })

    it('returns false when no fields have changed', async () => {
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [edp]
      })

      expect(dbUpdateEdpResult).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('updates the record and returns true when edpName changes', async () => {
      const updated = { ...edp, edpName: 'New Name' }
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [updated]
      })

      expect(dbUpdateEdpResult).toHaveBeenCalledWith({
        db,
        quoteId: 1,
        edpId: 123,
        edp: updated
      })
      expect(result).toBe(true)
    })

    it('updates the record and returns true when edpType changes', async () => {
      const updated = { ...edp, edpType: 'BIODIVERSITY' }
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [updated]
      })

      expect(dbUpdateEdpResult).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('updates the record and returns true when levy_gbp_min changes', async () => {
      const updated = { ...edp, levyGbp: { min: 150, max: 200 } }
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [updated]
      })

      expect(dbUpdateEdpResult).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('updates the record and returns true when levy_gbp_max changes', async () => {
      const updated = { ...edp, levyGbp: { min: 100, max: 250 } }
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [updated]
      })

      expect(dbUpdateEdpResult).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('updates the record and returns true when impact changes', async () => {
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

      expect(dbUpdateEdpResult).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('skips an EDP with no matching existing record', async () => {
      const unmatched = { ...edp, edpId: 999 }
      const result = await saveOrUpdateEdpResults({
        db,
        quoteId: 1,
        edps: [unmatched]
      })

      expect(dbUpdateEdpResult).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })
  })
})
