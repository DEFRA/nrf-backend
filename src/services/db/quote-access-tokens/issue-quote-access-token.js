import { createLogger } from '../../../common/helpers/logging/logger.js'

/**
 * @param {object} params
 * @param {{query: Function}} params.db
 * @param {number} params.quoteId
 * @param {string} params.tokenHash
 */
export const dbIssueQuoteAccessToken = async ({ db, quoteId, tokenHash }) => {
  const logger = createLogger()

  // At most one active token per quote: expire any existing token and insert
  // the new one in a single statement so the new row commits atomically. A
  // separate expire-then-insert leaves a window where a concurrent reader can
  // observe no live token for the quote.
  await db.query(
    `WITH expired AS (
       UPDATE quote_access_tokens
       SET expires_at = now()
       WHERE quote_id = $2
         AND expires_at > now()
     )
     INSERT INTO quote_access_tokens (token_hash, quote_id)
     VALUES ($1, $2)`,
    [tokenHash, quoteId]
  )

  logger.info({ quoteId }, 'Quote access token issued')
}
