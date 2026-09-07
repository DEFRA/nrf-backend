import {
  dbSaveEdpResults,
  dbGetEdpResults,
  dbUpdateEdpResult,
  dbFillEdpPlaceholder
} from '../../../services/db/quote_edp_results/queries.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'

const logger = createLogger()

const sortedStringify = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
        )
      : v
  )

/**
 * @param {{ edp_name: string, edp_type: string, impact: object, levy_excluding_vat: string, levy_inflation_adjusted: string, levy_base_amount: string, levy_model_version: number }} existing
 * @param {{ edpName: string, edpType: string, impact: object, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } }} edp
 * @returns {boolean} true if any tracked field differs from the stored row
 */
const hasEdpChanged = (existing, edp) => {
  const impactChanged =
    sortedStringify(existing.impact) !== sortedStringify(edp.impact)
  return [
    existing.edp_name !== edp.edpName,
    existing.edp_type !== edp.edpType,
    Number.parseFloat(existing.levy_excluding_vat) !==
      edp.levyGbp.amountExcludingVat,
    Number.parseFloat(existing.levy_inflation_adjusted) !==
      edp.levyGbp.amountInflationAdjusted,
    Number.parseFloat(existing.levy_base_amount) !== edp.levyGbp.baseAmount,
    existing.levy_model_version !== edp.levyGbp.modelVersion,
    impactChanged
  ].some(Boolean)
}

/**
 * Applies an assessor callback's EDP results to a quote: updates rows it
 * already has, claims placeholders created at quote creation, and inserts the
 * rest. Callers run this under a quote row lock, so the reads it makes are
 * stable for the length of the callback.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {Array<{ edpId: number, edpName: string, edpType: string, impact: object, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } }>} params.edps
 * @returns {Promise<boolean>} true if this callback changed anything
 */
export const saveOrUpdateEdpResults = async ({ db, quoteId, edps }) => {
  const existingEdpResults = await dbGetEdpResults({ db, quoteId })

  // Must be read before anything is written: it decides whether an unmatched
  // EDP is inserted or skipped, and a fill would otherwise flip it mid-loop.
  const hadResolvedRows = existingEdpResults.some((row) => row.edp_id !== null)

  let anyChanged = false
  const unmatched = []

  for (const edp of edps) {
    const resolved = existingEdpResults.find((row) => row.edp_id === edp.edpId)
    if (resolved) {
      if (hasEdpChanged(resolved, edp)) {
        await dbUpdateEdpResult({ db, quoteId, edpId: edp.edpId, edp })
        anyChanged = true
      }
      continue
    }

    const placeholder = existingEdpResults.find(
      (row) => row.edp_id === null && row.edp_name === edp.edpName
    )
    if (placeholder) {
      const filled = await dbFillEdpPlaceholder({ db, quoteId, edp })
      if (filled > 0) {
        anyChanged = true
        continue
      }
      // The rows were read once, before any write, so a second EDP sharing a
      // name sees the placeholder this loop already claimed. It still needs a
      // row of its own.
    }

    unmatched.push(edp)
  }

  if (unmatched.length === 0) {
    return anyChanged
  }

  if (hadResolvedRows) {
    logger.info(
      { quoteId, edpIds: unmatched.map((unmatchedEdp) => unmatchedEdp.edpId) },
      'Skipping EDPs with no existing row on a quote that already has results'
    )
    return anyChanged
  }

  // The unique (quote_id, edp_id) constraint is the backstop for any caller
  // that reaches this without the quote lock.
  const inserted = await dbSaveEdpResults({ db, quoteId, edps: unmatched })
  return anyChanged || inserted > 0
}
