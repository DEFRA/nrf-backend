import { GET_HELP_SECTION } from './get-help-section.js'

const RETRIEVE_QUOTE_EMAIL_TITLE =
  'Nature restoration levy – retrieve your quote details'

/**
 * Builds the whole retrieve your quote email as Notify Markdown, with the magic
 * link and NRL reference resolved. It is sent through a Notify template that
 * only passes the subject and content through, so the copy only ever changes
 * with a backend deploy.
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
  subject: RETRIEVE_QUOTE_EMAIL_TITLE,
  content: `# ${RETRIEVE_QUOTE_EMAIL_TITLE}

## NRL reference: ${nrfQuoteReference}

Retrieve the details you previously gave us for your quote. Use them to provide the information needed to request to use the nature restoration levy.

[Retrieve the quote details](${retrieveQuoteUrl}).

${GET_HELP_SECTION}`
})
