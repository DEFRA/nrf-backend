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
 * The email types that carry a quote and its results. Queries that re-send an
 * email, or report the quote's headline email status, match on this list rather
 * than excluding the types they don't want, so a new email type has to opt in
 * deliberately instead of being swept in by default.
 */
export const QUOTE_EMAIL_TYPES = [
  EMAIL_TYPE_QUOTE_RESULTS,
  EMAIL_TYPE_RESEND_QUOTE_LINK
]
