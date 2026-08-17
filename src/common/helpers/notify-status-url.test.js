import { buildNotifyStatusUrl } from './notify-status-url.js'
import { config } from '../../config.js'

vi.mock('../../config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

const NOTIFICATION_ID = '47cbb989-9546-418c-8828-232c3dc57537'
const SERVICE_ID = 'a76741a1-42be-4231-ae74-15ec14b81a11'
const API_KEY_ID = 'b1111111-2222-3333-4444-555555555555'

// A key shaped like a real Notify key: `<name>-<serviceId>-<apiKeyId>`.
const apiKey = `nrf-backend-${SERVICE_ID}-${API_KEY_ID}`

const stubConfig = (overrides = {}) =>
  config.get.mockImplementation((key) => {
    if (key === 'notify') {
      return {
        apiKey: overrides.apiKey === undefined ? apiKey : overrides.apiKey
      }
    }
    if (key === 'notify.statusPageBaseUrl') {
      return (
        overrides.statusPageBaseUrl ??
        'https://www.notifications.service.gov.uk'
      )
    }
    return undefined
  })

describe('buildNotifyStatusUrl', () => {
  it('builds a dashboard URL from the service id parsed out of the API key', () => {
    stubConfig()

    expect(buildNotifyStatusUrl(NOTIFICATION_ID)).toBe(
      `https://www.notifications.service.gov.uk/services/${SERVICE_ID}/notification/${NOTIFICATION_ID}`
    )
  })

  it('honours a custom status page base url', () => {
    stubConfig({ statusPageBaseUrl: 'https://notify.example' })

    expect(buildNotifyStatusUrl(NOTIFICATION_ID)).toBe(
      `https://notify.example/services/${SERVICE_ID}/notification/${NOTIFICATION_ID}`
    )
  })

  it('returns null when no notification id is given', () => {
    expect(buildNotifyStatusUrl(undefined)).toBeNull()
    expect(buildNotifyStatusUrl('')).toBeNull()
  })

  it('returns null when no API key is configured', () => {
    stubConfig({ apiKey: '' })

    expect(buildNotifyStatusUrl(NOTIFICATION_ID)).toBeNull()
  })

  it('returns null when the API key is too short to contain a service id', () => {
    stubConfig({ apiKey: 'short-key' })

    expect(buildNotifyStatusUrl(NOTIFICATION_ID)).toBeNull()
  })
})
