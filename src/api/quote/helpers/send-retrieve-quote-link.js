import { EMAIL_TYPE_RETRIEVE_QUOTE_LINK } from '../../../common/constants/email-type.js'
import { sendRetrieveQuoteEmailWithFreshToken } from './send-retrieve-quote-email-with-fresh-token.js'
import { recordEmailNotification } from './record-email-notification.js'

/**
 * Emails the retrieve your quote magic link (issuing a fresh single-use token
 * for the quote, expiring any live one) and records the notification.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {{ id: number, reference: string, email: { address: string } }} params.quote
 * @returns {Promise<boolean>} whether Notify accepted the email
 */
export const sendRetrieveQuoteLink = async ({ db, quote }) => {
  const emailResult = await sendRetrieveQuoteEmailWithFreshToken({ db, quote })

  await recordEmailNotification({
    db,
    quoteId: quote.id,
    emailResult,
    emailType: EMAIL_TYPE_RETRIEVE_QUOTE_LINK
  })

  return Boolean(emailResult)
}
