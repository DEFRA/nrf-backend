export const dbSaveEdpResults = async ({ db, quoteId, edps, createdAt }) => {
  await db.query('DELETE FROM quote_edp_results WHERE quote_id = $1', [quoteId])
  for (const edp of edps) {
    const { edpId, edpName, edpType, impact, levyGbp } = edp
    await db.query(
      `INSERT INTO quote_edp_results (quote_id, edp_id, edp_name, edp_type, impact, levy_gbp_min, levy_gbp_max, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        quoteId,
        edpId,
        edpName,
        edpType,
        JSON.stringify(impact),
        levyGbp.min,
        levyGbp.max,
        createdAt
      ]
    )
  }
}

export const dbGetEdpResults = async ({ db, quoteId }) => {
  const { rows } = await db.query(
    'SELECT * FROM quote_edp_results WHERE quote_id = $1',
    [quoteId]
  )
  return rows
}

export const dbUpdateEdpResult = async ({ db, quoteId, edpId, edp }) => {
  const { edpName, edpType, impact, levyGbp } = edp
  await db.query(
    `UPDATE quote_edp_results
     SET edp_name = $1, edp_type = $2, impact = $3, levy_gbp_min = $4, levy_gbp_max = $5
     WHERE quote_id = $6 AND edp_id = $7`,
    [
      edpName,
      edpType,
      JSON.stringify(impact),
      levyGbp.min,
      levyGbp.max,
      quoteId,
      edpId
    ]
  )
}
