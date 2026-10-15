import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuoteWithToken,
  redeemToken,
  sendRedeemTokenRequest
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/sns/publish-event.js')

describe('Redeem quote token endpoint', () => {
  const getServer = setupTestServer()

  it('should accept a live token', async () => {
    const { reference, token } = await createQuoteWithToken({
      server: getServer()
    })

    expect(
      await redeemToken({ server: getServer(), reference, token })
    ).toEqual({ accessStatus: 'valid' })
  })

  it('should only allow the token to be used once', async () => {
    const { reference, token } = await createQuoteWithToken({
      server: getServer()
    })

    const first = await redeemToken({ server: getServer(), reference, token })
    const second = await redeemToken({ server: getServer(), reference, token })

    expect(first.accessStatus).toBe('valid')
    expect(second.accessStatus).toBe('expired')
  })

  it('should accept the token only once when redeemed concurrently', async () => {
    const { reference, token } = await createQuoteWithToken({
      server: getServer()
    })

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        redeemToken({ server: getServer(), reference, token })
      )
    )

    const accepted = results.filter((r) => r.accessStatus === 'valid')
    expect(accepted).toHaveLength(1)
  })

  it('should report an expired token as expired', async () => {
    const { reference, token } = await createQuoteWithToken({
      server: getServer(),
      expiresAt: new Date(Date.now() - 1000).toISOString()
    })

    expect(
      await redeemToken({ server: getServer(), reference, token })
    ).toEqual({ accessStatus: 'expired' })
  })

  it('should report a token that was never issued as invalid', async () => {
    const { reference } = await createQuoteWithToken({ server: getServer() })

    expect(
      await redeemToken({
        server: getServer(),
        reference,
        token: 'a-token-that-was-never-issued'
      })
    ).toEqual({ accessStatus: 'invalid' })
  })

  it('should report a token for a different quote as invalid', async () => {
    const first = await createQuoteWithToken({ server: getServer() })
    const second = await createQuoteWithToken({ server: getServer() })

    expect(
      await redeemToken({
        server: getServer(),
        reference: second.reference,
        token: first.token
      })
    ).toEqual({ accessStatus: 'invalid' })
  })

  it('should report not_found for an unknown reference', async () => {
    expect(
      await redeemToken({
        server: getServer(),
        reference: 'NRL-999999',
        token: 'any-token'
      })
    ).toEqual({ accessStatus: 'not_found' })
  })

  it.each([
    ['the reference format is invalid', 'INVALID', 'any-token'],
    ['the token is missing', 'NRL-999999', undefined]
  ])('should return 400 when %s', async (_name, reference, token) => {
    const response = await sendRedeemTokenRequest({
      server: getServer(),
      reference,
      token
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
