import { config } from '../../config.js'

// A Notify API key ends `...-<serviceId>-<apiKeyId>`, both 36-char UUIDs.
// `notifications-node-client` itself parses these with the same offsets, so we
// mirror them to recover the service id needed for the dashboard URL.
const SERVICE_ID_START_OFFSET = 73 // length - 73
const SERVICE_ID_END_OFFSET = 37 // length - 37

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Build a deep link to a notification's page in the GOV.UK Notify dashboard.
 * The service id is parsed from the configured Notify API key (same offsets the
 * Node client uses internally). Returns null when no key is configured or the
 * key is shaped unexpectedly, so callers can render a status without a link.
 *
 * @param {string} notificationId - GOV.UK Notify notification UUID
 * @returns {string|null}
 */
export const buildNotifyStatusUrl = (notificationId) => {
  if (!notificationId) {
    return null
  }

  const apiKey = config.get('notify').apiKey
  if (!apiKey || apiKey.length < SERVICE_ID_START_OFFSET) {
    return null
  }

  const serviceId = apiKey.slice(
    apiKey.length - SERVICE_ID_START_OFFSET,
    apiKey.length - SERVICE_ID_END_OFFSET
  )
  if (!UUID_PATTERN.test(serviceId)) {
    return null
  }

  return `${config.get('notify.statusPageBaseUrl')}/services/${serviceId}/notification/${notificationId}`
}
