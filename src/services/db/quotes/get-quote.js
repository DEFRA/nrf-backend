import { QUOTE_SELECT_SQL, mapQuoteRows } from './quote-row-mapper.js'

export const dbGetQuote = async ({ db, reference }) => {
  const { rows } = await db.query(
    `${QUOTE_SELECT_SQL} WHERE q.reference = $1`,
    [reference]
  )
  return mapQuoteRows(rows)
}
