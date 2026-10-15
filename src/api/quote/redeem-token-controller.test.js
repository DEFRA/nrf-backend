import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  issueAccessToken,
  sendRedeemTokenRequest
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/sns/publish-event.js')

describe('Redeem quote token endpoint', () => {
  const getServer = setupTestServer()

  const createQuoteWithToken = async (overrides) => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)
    const token = await issueAccessToken({
      server: getServer(),
      reference,
      ...overrides
    })
    return { reference, token }
  }

  const redeem = async (params) => {
    const response = await sendRedeemTokenRequest({
      server: getServer(),
      ...params
    })
    expect(response.statusCode).toBe(statusCodes.ok)
    return JSON.parse(response.payload)
  }

  it('should accept a live token', async () => {
    const { reference, token } = await createQuoteWithToken()

    expect(await redeem({ reference, token })).toEqual({
      accessStatus: 'valid'
    })
  })

  it('should only allow the token to be used once', async () => {
    const { reference, token } = await createQuoteWithToken()

    const first = await redeem({ reference, token })
    const second = await redeem({ reference, token })

    expect(first.accessStatus).toBe('valid')
    expect(second.accessStatus).toBe('expired')
  })

  it('should report an expired token as expired', async () => {
    const { reference, token } = await createQuoteWithToken({
      expiresAt: new Date(Date.now() - 1000).toISOString()
    })

    expect(await redeem({ reference, token })).toEqual({
      accessStatus: 'expired'
    })
  })

  it('should report a token that was never issued as invalid', async () => {
    const { reference } = await createQuoteWithToken()

    expect(
      await redeem({ reference, token: 'a-token-that-was-never-issued' })
    ).toEqual({ accessStatus: 'invalid' })
  })

  it('should report a token for a different quote as invalid', async () => {
    const first = await createQuoteWithToken()
    const second = await createQuoteWithToken()

    expect(
      await redeem({ reference: second.reference, token: first.token })
    ).toEqual({ accessStatus: 'invalid' })
  })

  it('should report not_found for an unknown reference', async () => {
    expect(
      await redeem({ reference: 'NRL-999999', token: 'any-token' })
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
