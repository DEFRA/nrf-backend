/**
 * Atomically redeems a quote access token.
 *
 * Consumes one session against the token when it is live and within its
 * session budget. When redemption fails, a follow-up read reports `expired`
 * only when the token is genuinely past its expiry time — a session-exhausted
 * but still-live token is not `expired`. This matches the resend-known
 * contract, which only honours time-expired tokens for a one-click resend, so
 * the access page and the resend endpoint agree on which links offer the
 * one-click button.
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
     SET session_count   = session_count + 1,
         first_viewed_at = COALESCE(first_viewed_at, now()),
         last_viewed_at  = now()
     WHERE token_hash    = $1
       AND quote_id      = $2
       AND expires_at    > now()
       AND session_count < max_sessions
     RETURNING quote_id`,
    [tokenHash, quoteId]
  )

  if (rows.length) {
    return { redeemed: true, expired: false }
  }

  const { rows: existing } = await db.query(
    `SELECT expires_at <= now() AS time_expired
     FROM quote_access_tokens
     WHERE token_hash = $1
       AND quote_id   = $2`,
    [tokenHash, quoteId]
  )

  return { redeemed: false, expired: existing[0]?.time_expired === true }
}
