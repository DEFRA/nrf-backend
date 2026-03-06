export const dbCreateQuote = async ({ db }) => {
  const { rows } = await db.query(
    'INSERT INTO quotes DEFAULT VALUES RETURNING id, reference'
  )
  return rows[0]
}

export const dbGetQuote = async ({ db, reference }) => {
  const { rows } = await db.query(
    'SELECT id, reference FROM quotes WHERE reference = $1',
    [reference]
  )
  return rows[0] ?? null
}
