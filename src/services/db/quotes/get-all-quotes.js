import { QUOTE_SELECT_SQL, mapQuoteRows } from './quote-row-mapper.js'

/**
 * @param {{ db: object }} params
 * @returns {Promise<object[]>}
 */
export const dbGetAllQuotes = async ({ db }) => {
  const { rows } = await db.query(
    `${QUOTE_SELECT_SQL} ORDER BY q.created_at DESC`
  )

  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, [])
    }
    grouped.get(row.id).push(row)
  }

  return Array.from(grouped.values()).map(mapQuoteRows)
}
