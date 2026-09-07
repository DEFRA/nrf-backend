import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { dbLockQuote } from '../../../services/db/quotes/lock-quote.js'
import { generateToken } from '../../../common/helpers/token/generate-token.js'
import { withTransaction } from '../../../services/db/with-transaction.js'
import { saveOrUpdateEdpResults } from './save-or-update-edp-results.js'

/**
 * Applies an assessor callback to a quote under a row lock, issuing an access
 * token when the callback changed anything.
 *
 * The lock covers the whole callback: without it two concurrent callbacks can
 * each win a different subset of a multi-EDP quote's rows, and both then issue
 * a token — expiring the first — and email the user.
 *
 * @param {object} params
 * @param {{ connect: Function }} params.pool
 * @param {number} params.quoteId
 * @param {Array<object>} params.edps - EDP results as sent by the impact assessor
 * @returns {Promise<{ anyUpdated: boolean, rawToken?: string }>}
 */
export const applyEdpResults = async ({ pool, quoteId, edps }) =>
  withTransaction(pool, async (client) => {
    await dbLockQuote({ db: client, quoteId })

    const anyUpdated = await saveOrUpdateEdpResults({
      db: client,
      quoteId,
      edps
    })

    if (!anyUpdated) {
      return { anyUpdated: false }
    }

    // Commits with the results it grants access to.
    const { raw, hash } = generateToken()
    await dbIssueQuoteAccessToken({ db: client, quoteId, tokenHash: hash })

    return { anyUpdated: true, rawToken: raw }
  })
