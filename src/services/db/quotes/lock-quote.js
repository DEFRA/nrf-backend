/**
 * Takes an exclusive row lock on a quote for the rest of the caller's
 * transaction, serialising concurrent work on that quote.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db - a client inside a transaction
 * @param {number} params.quoteId
 */
export const dbLockQuote = async ({ db, quoteId }) => {
  await db.query('SELECT id FROM quotes WHERE id = $1 FOR UPDATE', [quoteId])
}
