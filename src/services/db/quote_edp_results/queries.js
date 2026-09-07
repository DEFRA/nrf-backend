/**
 * Inserts the EDP results for a quote, skipping any (quote_id, edp_id) that
 * already exists. Returns the number of rows actually inserted.
 *
 * All rows go in via a single multi-row statement so ON CONFLICT is evaluated
 * atomically for the whole set. Callbacks are serialised by the quote row lock;
 * this constraint is the backstop for any caller that skips it.
 */
/**
 * @param {object} params
 * @param {number} params.quoteId
 * @param {{ edpId: number, edpName: string, edpType: string, impact: object, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } }} params.edp
 * @returns {Array} the column values for one quote_edp_results row, in insert order
 */
const edpRowValues = ({ quoteId, edp }) => [
  quoteId,
  edp.edpId,
  edp.edpName,
  edp.edpType,
  JSON.stringify(edp.impact),
  edp.levyGbp.amountExcludingVat,
  edp.levyGbp.baseAmount,
  edp.levyGbp.amountInflationAdjusted,
  edp.levyGbp.modelVersion
]

export const dbSaveEdpResults = async ({ db, quoteId, edps }) => {
  if (edps.length === 0) {
    return 0
  }

  const params = []
  const rowPlaceholders = edps.map((edp) => {
    const placeholders = edpRowValues({ quoteId, edp }).map((value) => {
      params.push(value)
      return `$${params.length}`
    })
    return `(${placeholders.join(', ')}, NOW())`
  })

  const { rowCount } = await db.query(
    `INSERT INTO quote_edp_results (quote_id, edp_id, edp_name, edp_type, impact, levy_excluding_vat, levy_base_amount, levy_inflation_adjusted, levy_model_version, created_at)
     VALUES ${rowPlaceholders.join(', ')}
     ON CONFLICT (quote_id, edp_id) DO NOTHING`,
    params
  )

  return rowCount
}

/**
 * Inserts one placeholder row per intersecting EDP: name and catchments only,
 * filled in later by the assessor callback.
 *
 * The conflict target repeats the index predicate because Postgres requires it
 * to infer a partial unique index.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {Array<{ label: string, catchments: Array<object> }>} params.intersectingEdps
 * @returns {Promise<number>} the number of rows inserted
 */
export const dbSavePlaceholderEdpResults = async ({
  db,
  quoteId,
  intersectingEdps
}) => {
  if (intersectingEdps.length === 0) {
    return 0
  }

  const params = []
  const rowPlaceholders = intersectingEdps.map((edp) => {
    const values = [quoteId, edp.label, JSON.stringify(edp.catchments ?? [])]
    const placeholders = values.map((value) => {
      params.push(value)
      return `$${params.length}`
    })
    return `(${placeholders.join(', ')}, NOW())`
  })

  const { rowCount } = await db.query(
    `INSERT INTO quote_edp_results (quote_id, edp_name, catchments, created_at)
     VALUES ${rowPlaceholders.join(', ')}
     ON CONFLICT (quote_id, edp_name) WHERE edp_id IS NULL DO NOTHING`,
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

/**
 * Fills the placeholder row for an EDP name, leaving catchments untouched.
 *
 * `edp_id IS NULL` makes this a claim rather than an update: a zero row count
 * means the placeholder was already taken, so the caller must not report a
 * change it did not make.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {{ edpId: number, edpName: string, edpType: string, impact: object, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } }} params.edp
 * @returns {Promise<number>} rows affected — 0 if the placeholder was already claimed
 */
export const dbFillEdpPlaceholder = async ({ db, quoteId, edp }) => {
  const { edpId, edpName, edpType, impact, levyGbp } = edp
  const { rowCount } = await db.query(
    `UPDATE quote_edp_results
        SET edp_id = $1, edp_type = $2, impact = $3, levy_excluding_vat = $4,
            levy_base_amount = $5, levy_inflation_adjusted = $6,
            levy_model_version = $7, updated_at = NOW()
      WHERE quote_id = $8 AND edp_name = $9 AND edp_id IS NULL`,
    [
      edpId,
      edpType,
      JSON.stringify(impact),
      levyGbp.amountExcludingVat,
      levyGbp.baseAmount,
      levyGbp.amountInflationAdjusted,
      levyGbp.modelVersion,
      quoteId,
      edpName
    ]
  )
  return rowCount
}

export const dbUpdateEdpResult = async ({ db, quoteId, edpId, edp }) => {
  const { edpName, edpType, impact, levyGbp } = edp
  await db.query(
    `UPDATE quote_edp_results
     SET edp_name = $1, edp_type = $2, impact = $3, levy_excluding_vat = $4, levy_base_amount = $5, levy_inflation_adjusted = $6, levy_model_version = $7, updated_at = NOW()
     WHERE quote_id = $8 AND edp_id = $9`,
    [
      edpName,
      edpType,
      JSON.stringify(impact),
      levyGbp.amountExcludingVat,
      levyGbp.baseAmount,
      levyGbp.amountInflationAdjusted,
      levyGbp.modelVersion,
      quoteId,
      edpId
    ]
  )
}
