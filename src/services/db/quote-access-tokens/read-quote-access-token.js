/**
 * Reads a quote access token without consuming a session.
 *
 * Used when the caller has already proved a valid token earlier in the
 * session (e.g. holds a session cookie) and only needs to re-read the quote.
 * Distinguishes a live token (valid), an expired/exhausted one (expired),
 * and an unknown/mismatched one (neither). `timeExpired` further isolates the
 * case where the token is past its expiry time, as opposed to merely having
 * exhausted its session budget — callers that grant ownership on expiry (e.g.
 * resend-known) must not treat a session-exhausted-but-still-valid token as
 * expired, or the session budget can be reset by requesting a new link.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {string} params.tokenHash
 * @param {number} params.quoteId
 * @returns {Promise<{ valid: boolean, expired: boolean, timeExpired: boolean }>}
 */
export const dbReadQuoteAccessToken = async ({ db, tokenHash, quoteId }) => {
  const { rows } = await db.query(
    `SELECT expires_at > now() AND session_count < max_sessions AS live,
            expires_at <= now() AS time_expired
     FROM quote_access_tokens
     WHERE token_hash = $1
       AND quote_id   = $2`,
    [tokenHash, quoteId]
  )

  if (!rows.length) {
    return { valid: false, expired: false, timeExpired: false }
  }

  const { live, time_expired: timeExpired } = rows[0]
  return { valid: live, expired: !live, timeExpired }
}
