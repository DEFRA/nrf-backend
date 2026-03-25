export const dbSaveEdpResults = async ({ db, quoteId, edps }) => {
  for (const edp of edps) {
    const { edpId, edpName, edpType, impact, levyGbp } = edp
    await db.query(
      `INSERT INTO quote_edp_results (quote_id, edp_id, edp_name, edp_type, impact, levy_gbp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [quoteId, edpId, edpName, edpType, JSON.stringify(impact), levyGbp]
    )
  }
}
