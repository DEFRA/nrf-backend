/**
 * `quote_email_notifications.email_type` values. The set is mirrored by the
 * `chk_qen_email_type` CHECK constraint, so adding one here needs a matching
 * changeset to widen that constraint.
 *
 * @typedef {'quote_results' | 'resend_quote_link' | 'retrieve_quote_link'} EmailType
 */
export const EMAIL_TYPE_QUOTE_RESULTS = 'quote_results'
export const EMAIL_TYPE_RESEND_QUOTE_LINK = 'resend_quote_link'
export const EMAIL_TYPE_RETRIEVE_QUOTE_LINK = 'retrieve_quote_link'

/**
 * The email types that carry a quote and its results. Queries that report the
 * quote's headline email status match on this list rather than excluding the
 * types they don't want, so a new email type has to opt in deliberately
 * instead of being swept in by default.
 */
export const QUOTE_EMAIL_TYPES = [
  EMAIL_TYPE_QUOTE_RESULTS,
  EMAIL_TYPE_RESEND_QUOTE_LINK
]

/**
 * The email types the Notify retry worker re-sends when Notify reports a
 * retryable delivery failure: the quote-class types above plus the
 * retrieve-quote magic link. Deliberately wider than QUOTE_EMAIL_TYPES — a
 * retrieve_quote_link email must never displace the quote's headline email
 * status, but a failed send is still retried. Keep the two lists separate.
 */
export const RETRYABLE_EMAIL_TYPES = [
  ...QUOTE_EMAIL_TYPES,
  EMAIL_TYPE_RETRIEVE_QUOTE_LINK
]
