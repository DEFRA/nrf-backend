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
