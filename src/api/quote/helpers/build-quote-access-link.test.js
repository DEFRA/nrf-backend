import { buildQuoteAccessLink } from './build-quote-access-link.js'
import { config } from '../../../config.js'

describe('buildQuoteAccessLink', () => {
  it('builds the access link from the frontend base url, reference and raw token', () => {
    const frontEndBaseUrl = config.get('frontEndBaseUrl')

    const link = buildQuoteAccessLink({
      reference: 'NRF-000001',
      rawToken: 'abc123token'
    })

    expect(link).toBe(`${frontEndBaseUrl}/quote/NRF-000001/abc123token`)
  })
})
