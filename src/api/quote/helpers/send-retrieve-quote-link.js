import { generateToken } from '../../../common/helpers/token/generate-token.js'
import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { EMAIL_TYPE_RETRIEVE_QUOTE_LINK } from '../../../common/constants/email-type.js'
import { buildRetrieveQuoteUrl } from './build-retrieve-quote-url.js'
import { sendRetrieveQuoteEmail } from './send-retrieve-quote-email.js'
import { recordEmailNotification } from './record-email-notification.js'

/**
 * Issues a fresh single-use token for the quote (expiring any live one), emails
 * the magic link and records the notification.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {{ id: number, reference: string, email: { address: string } }} params.quote
 * @returns {Promise<boolean>} whether Notify accepted the email
 */
export const sendRetrieveQuoteLink = async ({ db, quote }) => {
  const { raw, hash } = generateToken()

  await dbIssueQuoteAccessToken({ db, quoteId: quote.id, tokenHash: hash })

  const emailResult = await sendRetrieveQuoteEmail({
    recipientEmailAddress: quote.email.address,
    retrieveQuoteUrl: buildRetrieveQuoteUrl({
      reference: quote.reference,
      rawToken: raw
    })
  })

  await recordEmailNotification({
    db,
    quoteId: quote.id,
    emailResult,
    emailType: EMAIL_TYPE_RETRIEVE_QUOTE_LINK
  })

  return Boolean(emailResult)
}
