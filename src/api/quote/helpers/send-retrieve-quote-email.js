import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'
import { buildRetrieveQuoteEmailContent } from './build-retrieve-quote-email-content.js'

/**
 * Sends the retrieve your quote email containing the magic link.
 *
 * No Notify client reference is set — the send is identified by the
 * notification id Notify returns, and a magic link can be requested repeatedly
 * for one quote, so there is no per-quote value that would stay unique.
 * Persisting that id against the quote is the caller's responsibility, as it is
 * for the quote email.
 *
 * The Notify template only passes the email through: its subject and content
 * come from buildRetrieveQuoteEmailContent, so the copy changes with the code
 * and never in the Notify console.
 *
 * @param {object} params
 * @param {string} params.recipientEmailAddress
 * @param {string} params.retrieveQuoteUrl - magic link that takes the user back to their saved quote
 * @param {string} params.nrfQuoteReference - quote reference, e.g. NRL-000042, so the recipient can identify the quote
 * @returns {Promise<{ notificationId: string, sentDateTime: string } | null>} null when Notify rejected the send
 */
export const sendRetrieveQuoteEmail = async ({
  recipientEmailAddress,
  retrieveQuoteUrl,
  nrfQuoteReference
}) => {
  const { templateIds } = config.get('notify')
  return sendEmail({
    recipientEmailAddress,
    emailBodyVariables: buildRetrieveQuoteEmailContent({
      retrieveQuoteUrl,
      nrfQuoteReference
    }),
    templateId: templateIds.retrieveQuote
  })
}
