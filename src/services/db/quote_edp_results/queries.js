/**
 * Inserts the EDP results for a quote, skipping any (quote_id, edp_id) that
 * already exists. Returns the number of rows actually inserted.
 *
 * All rows go in via a single multi-row statement so ON CONFLICT is evaluated
 * atomically for the whole set. The unique constraint on (quote_id, edp_id)
 * then makes concurrent duplicate estimate callbacks safe: the first caller's
 * statement inserts every row, a concurrent duplicate conflicts on all of them
 * and inserts none. Only the caller with a non-zero count issues a token, so a
 * duplicate can't issue a second token that would expire the first — even when
 * a quote has several EDPs (a per-row loop could otherwise let each caller win
 * a different row and both proceed).
 */
export const dbSaveEdpResults = async ({ db, quoteId, edps }) => {
  if (edps.length === 0) {
    return 0
  }

  const values = []
  const params = []
  edps.forEach((edp, index) => {
    const base = index * 7
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, NOW())`
    )
    params.push(
      quoteId,
      edp.edpId,
      edp.edpName,
      edp.edpType,
      JSON.stringify(edp.impact),
      edp.levyGbp.min,
      edp.levyGbp.max
    )
  })

  const { rowCount } = await db.query(
    `INSERT INTO quote_edp_results (quote_id, edp_id, edp_name, edp_type, impact, levy_gbp_min, levy_gbp_max, created_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (quote_id, edp_id) DO NOTHING`,
    params
  )

  return rowCount
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
     SET edp_name = $1, edp_type = $2, impact = $3, levy_gbp_min = $4, levy_gbp_max = $5, updated_at = NOW()
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
