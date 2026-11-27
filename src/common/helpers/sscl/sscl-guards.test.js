import { assertSsclTestRouteAllowed } from './sscl-guards.js'

describe('assertSsclTestRouteAllowed', () => {
  it('refuses the test route in prod', () => {
    expect(() =>
      assertSsclTestRouteAllowed({ testEnabled: true, environment: 'prod' })
    ).toThrow('SSCL_SFTP_TEST_ENABLED must not be true in prod')
  })

  it.each([
    [true, 'local'],
    [true, 'dev'],
    [true, 'test'],
    [false, 'prod']
  ])('allows testEnabled=%s in %s', (testEnabled, environment) => {
    expect(() =>
      assertSsclTestRouteAllowed({ testEnabled, environment })
    ).not.toThrow()
  })
})
