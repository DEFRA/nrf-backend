/**
 * Whether a token was ever issued for the quote, whether or not it has since
 * expired or been used. Possession of any issued token proves ownership for
 * the one-click resend.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {string} params.tokenHash
 * @param {number} params.quoteId
 * @returns {Promise<boolean>}
 */
export const dbQuoteAccessTokenExists = async ({ db, tokenHash, quoteId }) => {
  const { rows } = await db.query(
    `SELECT 1
     FROM quote_access_tokens
     WHERE token_hash = $1
       AND quote_id   = $2`,
    [tokenHash, quoteId]
  )

  return rows.length > 0
}
