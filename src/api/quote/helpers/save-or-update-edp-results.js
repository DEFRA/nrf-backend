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

export const saveOrUpdateEdpResults = async ({ db, quoteId, edps }) => {
  const existingEdpResults = await dbGetEdpResults({ db, quoteId })
  if (existingEdpResults.length === 0) {
    await dbSaveEdpResults({ db, quoteId, edps })
    return true
  }

  let anyUpdated = false

  for (const edp of edps) {
    const existing = existingEdpResults.find((r) => r.edp_id === edp.edpId)
    if (!existing) {
      continue
    }

    const impactChanged =
      sortedStringify(existing.impact) !== sortedStringify(edp.impact)

    if (
      existing.edp_name !== edp.edpName ||
      existing.edp_type !== edp.edpType ||
      Number.parseFloat(existing.levy_gbp_min) !== edp.levyGbp.min ||
      Number.parseFloat(existing.levy_gbp_max) !== edp.levyGbp.max ||
      impactChanged
    ) {
      await dbUpdateEdpResult({ db, quoteId, edpId: edp.edpId, edp })
      anyUpdated = true
    }
  }

  return anyUpdated
}
