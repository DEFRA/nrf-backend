export const dbCreateQuote = async ({ db, emailAddress }) => {
  const { rows } = await db.query(
    'INSERT INTO quotes (email_address) VALUES ($1) RETURNING id, reference',
    [emailAddress]
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
