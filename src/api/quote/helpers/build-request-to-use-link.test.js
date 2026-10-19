import { buildRequestToUseLink } from './build-request-to-use-link.js'
import { config } from '../../../config.js'

describe('buildRequestToUseLink', () => {
  it('links to the enter NRL reference page with the reference pre-filled', () => {
    expect(buildRequestToUseLink({ reference: 'NRL-000001' })).toBe(
      `${config.get('frontEndBaseUrl')}/request-to-use/enter-nrl-reference?nrlReference=NRL-000001`
    )
  })
})
