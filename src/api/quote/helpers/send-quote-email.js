import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'
import { buildQuoteEmailContent } from './build-quote-email-content.js'

/**
 * Send a quote result email via GOV.UK Notify. Recording the notification id
 * against the quote is the caller's responsibility: initial sends and
 * user-initiated resends insert a new quote_email_notifications row; the retry
 * worker updates the existing row for that quote's email lifecycle. Keeping
 * persistence out of here means one helper is not tied to one persistence
 * shape.
 *
 * The Notify template only passes the email through: its subject and content
 * come from buildQuoteEmailContent, so the copy changes with the code and
 * never in the Notify console.
 *
 * @param {object} params
 * @param {string} params.recipientEmailAddress
 * @param {string} params.nrfQuoteReference
 * @param {string} [params.emailReference=nrfQuoteReference] - Notify dedup/reference key for the send; retries pass a suffixed value so a re-send can never be deduplicated against an earlier attempt
 * @param {string} params.nrfServiceUrl
 * @param {import('./build-quote-email-content.js').QuoteEmailEdp[]} params.edps
 * @param {number} params.housingUnits
 * @param {string} params.planningType
 * @param {string} params.requestToUseLink
 * @returns {Promise<{ notificationId: string, sentDateTime: string } | null>} - null if Notify rejected the send
 */
export const sendQuoteEmail = async ({
  recipientEmailAddress,
  nrfQuoteReference,
  emailReference = nrfQuoteReference,
  nrfServiceUrl,
  edps,
  housingUnits,
  planningType,
  requestToUseLink
}) => {
  const { templateIds } = config.get('notify')
  return sendEmail({
    recipientEmailAddress,
    emailReference,
    emailBodyVariables: buildQuoteEmailContent({
      nrfQuoteReference,
      nrfServiceUrl,
      edps,
      housingUnits,
      planningType,
      requestToUseLink
    }),
    templateId: templateIds.quote
  })
}
