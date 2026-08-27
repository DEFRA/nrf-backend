/**
 * GOV.UK Notify delivery statuses that represent a final outcome — the message
 * will not transition further, so the poller stops fetching them. Every other
 * status (created, sending, temporary-failure, …) is still in flight.
 *
 * Email-relevant terminal statuses only; `sent`/`pending` are SMS/letter.
 * @see https://docs.notifications.service.gov.uk/node.html
 */
export const TERMINAL_STATUSES = [
  'delivered',
  'permanent-failure',
  'technical-failure'
]

/**
 * GOV.UK Notify delivery statuses the retry worker treats as retryable — the
 * message never landed but the address is probably fine, so the email is
 * re-sent per the agreed retry policy (NRF2-849). `permanent-failure` (invalid
 * address) is excluded: retrying can never succeed, so the developer has to
 * submit a new quote request with a valid address.
 * @see https://docs.notifications.service.gov.uk/node.html
 */
export const RETRYABLE_DELIVERY_STATUSES = [
  'temporary-failure',
  'technical-failure'
]
