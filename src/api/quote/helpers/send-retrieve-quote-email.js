import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'

/**
 * Sends the retrieve your quote email containing the magic link.
 *
 * @param {object} params
 * @param {string} params.recipientEmailAddress
 * @param {string} params.nrfQuoteReference
 * @param {string} params.quoteAccessLink - magic link that takes the user back to their saved quote
 * @returns {Promise<{ notificationId: string, sentDateTime: string } | null>} null when Notify rejected the send
 */
export const sendRetrieveQuoteEmail = async ({
  recipientEmailAddress,
  nrfQuoteReference,
  quoteAccessLink
}) => {
  const { templateIds } = config.get('notify')
  return sendEmail({
    recipientEmailAddress,
    emailReference: `${nrfQuoteReference}-retrieve`,
    emailBodyVariables: { quoteAccessLink },
    templateId: templateIds.retrieveQuote
  })
}
