/**
 * `quote_edp_results.journey` values: which journey a levy calculation was
 * made in. The set is mirrored by the `ck_quote_edp_results_journey` CHECK
 * constraint, so adding one here needs a matching changeset to widen it.
 *
 * @typedef {'quote' | 'request_to_use'} Journey
 */
export const JOURNEY_QUOTE = 'quote'
export const JOURNEY_REQUEST_TO_USE = 'request_to_use'
