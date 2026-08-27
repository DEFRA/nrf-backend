import { QUOTE_SELECT_SQL, mapQuoteRows } from './quote-row-mapper.js'

/**
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.id - quote id
 */
export const dbGetQuoteById = async ({ db, id }) => {
  const { rows } = await db.query(`${QUOTE_SELECT_SQL} WHERE q.id = $1`, [id])
  return mapQuoteRows(rows)
}
