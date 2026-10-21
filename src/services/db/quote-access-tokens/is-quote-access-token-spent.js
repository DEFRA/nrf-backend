/**
 * Whether the quote has a token with this hash that can no longer be redeemed,
 * because it was used, timed out or was replaced by a newer one. A live token
 * is not spent: the holder should redeem it, not ask for another.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {string} params.tokenHash
 * @param {number} params.quoteId
 * @returns {Promise<boolean>}
 */
export const dbIsQuoteAccessTokenSpent = async ({ db, tokenHash, quoteId }) => {
  const { rows } = await db.query(
    `SELECT 1
     FROM quote_access_tokens
     WHERE token_hash = $1
       AND quote_id   = $2
       AND (redeemed_at IS NOT NULL OR expires_at <= now())`,
    [tokenHash, quoteId]
  )

  return rows.length > 0
}
