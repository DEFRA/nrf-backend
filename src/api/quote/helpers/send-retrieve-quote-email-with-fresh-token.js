import { generateToken } from '../../../common/helpers/token/generate-token.js'
import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { buildRetrieveQuoteUrl } from './build-retrieve-quote-url.js'
import { sendRetrieveQuoteEmail } from './send-retrieve-quote-email.js'

/**
 * Issues a fresh single-use token for the quote (expiring any live one) and
 * sends the retrieve your quote email containing the resulting magic link.
 *
 * Recording the notification against the quote is the caller's responsibility:
 * the initial send inserts a new quote_email_notifications row, while the retry
 * worker updates the existing row for that email lifecycle. Keeping persistence
 * out of here means one helper is not tied to one persistence shape.
 *
 * A fresh token is issued every time because only the token's hash is stored —
 * the raw value in the emailed link is unrecoverable — and a new token expires
 * any earlier live one, exactly like a user-initiated re-request.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {{ id: number, reference: string, email: { address: string } }} params.quote
 * @returns {Promise<{ notificationId: string, sentDateTime: string } | null>} null when Notify rejected the send
 */
export const sendRetrieveQuoteEmailWithFreshToken = async ({ db, quote }) => {
  const { raw, hash } = generateToken()

  await dbIssueQuoteAccessToken({ db, quoteId: quote.id, tokenHash: hash })

  return sendRetrieveQuoteEmail({
    recipientEmailAddress: quote.email.address,
    retrieveQuoteUrl: buildRetrieveQuoteUrl({
      reference: quote.reference,
      rawToken: raw
    })
  })
}
