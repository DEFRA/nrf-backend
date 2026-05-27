import { createLogger } from '../../../common/helpers/logging/logger.js'

/**
 * @param {object} params
 * @param {{query: Function}} params.db
 * @param {number} params.quoteId
 * @param {string} params.tokenHash
 */
export const dbIssueQuoteAccessToken = async ({ db, quoteId, tokenHash }) => {
  const logger = createLogger()

  // At most one active token per quote — expire any existing before inserting the new one
  await db.query(
    `UPDATE quote_access_tokens
     SET expires_at = now()
     WHERE quote_id = $1
       AND expires_at > now()`,
    [quoteId]
  )

  await db.query(
    `INSERT INTO quote_access_tokens (token_hash, quote_id)
     VALUES ($1, $2)`,
    [tokenHash, quoteId]
  )

  logger.info({ quoteId }, 'Quote access token issued')
}
