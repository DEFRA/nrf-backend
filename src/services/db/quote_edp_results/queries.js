import { JOURNEY_QUOTE } from '../../../common/constants/journey.js'

/**
 * @typedef {object} EdpLevyCalculation
 * @property {string} calculationDate ISO 8601 date-time the levy was calculated
 * @property {number} baseChargePerUnit
 * @property {number} units
 * @property {number} originalBaseAmount
 * @property {number} originalBaseChargePerUnit
 */

/**
 * Appends a new row to the quote's levy calculation history for each EDP.
 * Nothing is updated in place: the latest row for a quote and EDP is the
 * current calculation and earlier rows are the history.
 *
 * All rows go in via a single multi-row statement. Callers that must not
 * double-insert on a duplicate callback serialise on the quote first (see
 * withQuoteLock).
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {Array<{ edpId: number, edpName: string, edpStartDate: string, impact: object, catchments: Array<{ label: string, catchmentId: string, catchmentOverlapPercentage: number }> | undefined, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } & EdpLevyCalculation }>} params.edps
 * @param {string} [params.journey] which journey the calculation was made in
 * @returns {Promise<number>} the number of rows inserted
 */
export const dbSaveEdpResults = async ({
  db,
  quoteId,
  edps,
  journey = JOURNEY_QUOTE
}) => {
  if (edps.length === 0) {
    return 0
  }

  const params = []
  const rowPlaceholders = edps.map((edp) => {
    const placeholders = edpRowValues({ quoteId, edp, journey }).map(
      (value) => {
        params.push(value)
        return `$${params.length}`
      }
    )
    return `(${placeholders.join(', ')}, NOW())`
  })

  const { rowCount } = await db.query(
    `INSERT INTO quote_edp_results (quote_id, edp_id, edp_name, edp_start_date, impact, catchments, levy_provisional_amount, levy_inflation_adjusted, levy_model_version, levy_calculated_at, levy_base_charge_per_unit, levy_units, levy_original_base_amount, levy_original_base_charge_per_unit, journey, created_at)
     VALUES ${rowPlaceholders.join(', ')}`,
    params
  )

  return rowCount
}

/**
 * @param {object} params
 * @param {number} params.quoteId
 * @param {object} params.edp
 * @param {string} params.journey
 * @returns {Array} the column values for one quote_edp_results row, in insert order
 */
const edpRowValues = ({ quoteId, edp, journey }) => [
  quoteId,
  edp.edpId,
  edp.edpName,
  edp.edpStartDate,
  JSON.stringify(edp.impact),
  edp.catchments ? JSON.stringify(edp.catchments) : null,
  edp.levyGbp.baseAmount,
  edp.levyGbp.amountInflationAdjusted,
  edp.levyGbp.modelVersion,
  edp.levyGbp.calculationDate,
  edp.levyGbp.baseChargePerUnit,
  edp.levyGbp.units,
  edp.levyGbp.originalBaseAmount,
  edp.levyGbp.originalBaseChargePerUnit,
  journey
]

/**
 * The current calculation for each EDP of a quote: the last row created for
 * each (quote, EDP).
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @returns {Promise<object[]>}
 */
export const dbGetEdpResults = async ({ db, quoteId }) => {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (edp_id) *, edp_start_date::text AS edp_start_date_text
       FROM quote_edp_results
      WHERE quote_id = $1
      ORDER BY edp_id, created_at DESC, id DESC`,
    [quoteId]
  )
  return rows
}

/**
 * Appends a request to use row for each EDP of the quote: a complete copy of
 * the EDP's current results (impact, catchments) with the levy calculation
 * replaced by the one the user accepted. Written even when the amounts are
 * unchanged.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {import('../../../common/constants/journey.js').Journey} params.journey
 * @param {{ provisionalAmount: number, inflationAdjustedAmount: number, calculatorVersion: number } & EdpLevyCalculation} params.levy the levy calculation the frontend relays
 * @returns {Promise<number>} the number of rows inserted
 */
export const dbSaveLevyCalculation = async ({ db, quoteId, journey, levy }) => {
  const { rowCount } = await db.query(
    `INSERT INTO quote_edp_results (quote_id, edp_id, edp_name, edp_start_date, impact, catchments, levy_provisional_amount, levy_inflation_adjusted, levy_model_version, levy_calculated_at, levy_base_charge_per_unit, levy_units, levy_original_base_amount, levy_original_base_charge_per_unit, journey, created_at)
     SELECT DISTINCT ON (edp_id) quote_id, edp_id, edp_name, edp_start_date, impact, catchments, $2::numeric, $3::numeric, $4::integer, $5::timestamptz, $6::numeric, $7::integer, $8::numeric, $9::numeric, $10::varchar, NOW()
       FROM quote_edp_results
      WHERE quote_id = $1
      ORDER BY edp_id, created_at DESC, id DESC`,
    [
      quoteId,
      levy.provisionalAmount,
      levy.inflationAdjustedAmount,
      levy.calculatorVersion,
      levy.calculationDate,
      levy.baseChargePerUnit,
      levy.units,
      levy.originalBaseAmount,
      levy.originalBaseChargePerUnit,
      journey
    ]
  )
  return rowCount
}
