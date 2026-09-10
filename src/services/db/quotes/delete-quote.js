/**
 * Hard-deletes a quote. Joined rows in quote_edp_results,
 * quote_access_tokens and quote_email_notifications are removed by their
 * ON DELETE CASCADE foreign keys.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.id - quote id
 * @returns {Promise<boolean>} whether a quote was deleted
 */
export const dbDeleteQuote = async ({ db, id }) => {
  const { rowCount } = await db.query('DELETE FROM quotes WHERE id = $1', [id])

  return rowCount === 1
}
