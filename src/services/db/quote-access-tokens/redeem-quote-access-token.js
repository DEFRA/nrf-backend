/**
 * Atomically redeems a quote access token. A token is single-use: redeeming it
 * expires it, so a second attempt (or one after the 24 hour life) fails.
 *
 * When redemption fails, a follow-up query tells an expired or already used
 * token (row exists for this quote) from an unknown or mismatched one (no row).
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {string} params.tokenHash
 * @param {number} params.quoteId
 * @returns {Promise<{ redeemed: boolean, expired: boolean }>}
 */
export const dbRedeemQuoteAccessToken = async ({ db, tokenHash, quoteId }) => {
  const { rows } = await db.query(
    `UPDATE quote_access_tokens
     SET expires_at = now()
     WHERE token_hash = $1
       AND quote_id   = $2
       AND expires_at > now()
     RETURNING quote_id`,
    [tokenHash, quoteId]
  )

  if (rows.length) {
    return { redeemed: true, expired: false }
  }

  const { rows: existing } = await db.query(
    `SELECT 1
     FROM quote_access_tokens
     WHERE token_hash = $1
       AND quote_id   = $2`,
    [tokenHash, quoteId]
  )

  return { redeemed: false, expired: existing.length > 0 }
}
