import {
  dbSaveEdpResults,
  dbGetEdpResults,
  dbUpdateEdpResult
} from '../../../services/db/quote_edp_results/queries.js'
const sortedStringify = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
        )
      : v
  )

/**
 * @typedef {{ label: string, catchmentId: string | null, catchmentOverlapPercentage: number }} Catchment
 * `catchmentOverlapPercentage` is 0-100, enforced by `patchSchema`.
 */

/**
 * @param {{ edp_name: string, edp_type: string, impact: object, catchments: Catchment[] | null, levy_excluding_vat: string, levy_inflation_adjusted: string, levy_base_amount: string, levy_model_version: number }} existing
 * @param {{ edpName: string, edpType: string, impact: object, catchments: Catchment[] | undefined, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } }} edp
 * @returns {boolean} true if any tracked field differs from the stored row
 */
const hasEdpChanged = (existing, edp) => {
  const impactChanged =
    sortedStringify(existing.impact) !== sortedStringify(edp.impact)
  const catchmentsChanged =
    sortedStringify(existing.catchments ?? null) !==
    sortedStringify(edp.catchments ?? null)
  return [
    existing.edp_name !== edp.edpName,
    existing.edp_type !== edp.edpType,
    Number.parseFloat(existing.levy_excluding_vat) !==
      edp.levyGbp.amountExcludingVat,
    Number.parseFloat(existing.levy_inflation_adjusted) !==
      edp.levyGbp.amountInflationAdjusted,
    Number.parseFloat(existing.levy_base_amount) !== edp.levyGbp.baseAmount,
    existing.levy_model_version !== edp.levyGbp.modelVersion,
    impactChanged,
    catchmentsChanged
  ].some(Boolean)
}

export const saveOrUpdateEdpResults = async ({ db, quoteId, edps }) => {
  const existingEdpResults = await dbGetEdpResults({ db, quoteId })
  if (existingEdpResults.length === 0) {
    // Concurrent duplicate callbacks both reach here seeing no rows, but the
    // unique (quote_id, edp_id) constraint lets only one INSERT land. The loser
    // inserts nothing and returns false, so it won't issue a second token.
    const inserted = await dbSaveEdpResults({ db, quoteId, edps })
    return inserted > 0
  }

  let anyUpdated = false

  for (const edp of edps) {
    const existing = existingEdpResults.find((r) => r.edp_id === edp.edpId)
    if (!existing) {
      continue
    }

    if (hasEdpChanged(existing, edp)) {
      await dbUpdateEdpResult({ db, quoteId, edpId: edp.edpId, edp })
      anyUpdated = true
    }
  }

  return anyUpdated
}
