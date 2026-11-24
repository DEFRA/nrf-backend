/**
 * The retrieve your quote email's subject line.
 */
export const RETRIEVE_QUOTE_EMAIL_SUBJECT =
  'Nature restoration levy – retrieve your quote details'

/**
 * The whole retrieve your quote email body in the notation of the Notify
 * template it replaces: the same Markdown and the same ((placeholders)),
 * filled in by buildRetrieveQuoteEmailContent. Kept as one string so it can
 * be compared line for line with a Notify template or the prototype.
 */
export const RETRIEVE_QUOTE_EMAIL_TEMPLATE = `# Nature restoration levy – retrieve your quote details

## NRL reference: ((nrfQuoteReference))

Retrieve the details you previously gave us for your quote. Use them to provide the information needed to request to use the nature restoration levy.

[Retrieve the quote details](((retrieveQuoteUrl))).

## Get help with the nature restoration levy

If you need help with the nature restoration levy, contact Natural England.

Email: [enquiries@naturalengland.org.uk](mailto:enquiries@naturalengland.org.uk)

Telephone: 0300 060 3900

Monday to Friday, 10am to 4pm, except bank holidays

[Find out about call charges (opens in new tab)](https://www.gov.uk/call-charges)`
