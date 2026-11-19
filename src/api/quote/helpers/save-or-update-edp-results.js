import {
  dbSaveEdpResults,
  dbGetEdpResults
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
 * @param {{ edp_name: string, edp_start_date_text: string, impact: object, catchments: Catchment[] | null, levy_inflation_adjusted: string, levy_provisional_amount: string, levy_model_version: number }} existing the EDP's current (latest) row
 * @param {{ edpName: string, edpStartDate: string, impact: object, catchments: Catchment[] | undefined, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } }} edp
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
    existing.edp_start_date_text !== edp.edpStartDate,
    Number.parseFloat(existing.levy_inflation_adjusted) !==
      edp.levyGbp.amountInflationAdjusted,
    Number.parseFloat(existing.levy_provisional_amount) !==
      edp.levyGbp.baseAmount,
    existing.levy_model_version !== edp.levyGbp.modelVersion,
    impactChanged,
    catchmentsChanged
  ].some(Boolean)
}

/**
 * Records the callback's results as new rows in the quote's history: every EDP
 * the first time, and afterwards each EDP whose results changed. A repeat of
 * the same callback writes nothing. Callers must hold the quote's lock (see
 * withQuoteLock) so concurrent duplicates cannot both see an empty history.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {object[]} params.edps the callback's EDP entries
 * @returns {Promise<boolean>} true if any row was written, so the quote email should be sent
 */
export const saveOrUpdateEdpResults = async ({ db, quoteId, edps }) => {
  const existingEdpResults = await dbGetEdpResults({ db, quoteId })
  if (existingEdpResults.length === 0) {
    return (await dbSaveEdpResults({ db, quoteId, edps })) > 0
  }

  const changedEdps = edps.filter((edp) => {
    const existing = existingEdpResults.find((r) => r.edp_id === edp.edpId)
    return existing && hasEdpChanged(existing, edp)
  })

  const inserted = await dbSaveEdpResults({ db, quoteId, edps: changedEdps })
  return inserted > 0
}
