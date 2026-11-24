import { fillEmailTemplate } from './fill-email-template.js'
import {
  RETRIEVE_QUOTE_EMAIL_SUBJECT,
  RETRIEVE_QUOTE_EMAIL_TEMPLATE
} from './retrieve-quote-email-template.js'

/**
 * Builds the retrieve your quote email by filling in its Notify-style template.
 * It is sent through a Notify template that only passes the subject and content
 * through, so the copy only ever changes with a backend deploy.
 *
 * @param {object} params
 * @param {string} params.retrieveQuoteUrl - magic link that takes the user back to their saved quote
 * @param {string} params.nrfQuoteReference - quote reference, e.g. NRL-000042, so the recipient can identify the quote
 * @returns {import('./build-quote-email-content.js').EmailContent}
 */
export const buildRetrieveQuoteEmailContent = ({
  retrieveQuoteUrl,
  nrfQuoteReference
}) => ({
  subject: RETRIEVE_QUOTE_EMAIL_SUBJECT,
  content: fillEmailTemplate({
    template: RETRIEVE_QUOTE_EMAIL_TEMPLATE,
    values: { retrieveQuoteUrl, nrfQuoteReference }
  })
})
