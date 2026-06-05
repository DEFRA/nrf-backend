import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  issueAccessToken,
  sendResendKnownRequest,
  getAccessTokenRowsForReference
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

describe('Resend known quote link endpoint', () => {
  const getServer = setupTestServer()
  let notifySendEmail

  beforeEach(() => {
    notifySendEmail = vi
      .fn()
      .mockResolvedValue({ data: { id: 'notify-id-123' } })
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: notifySendEmail
    })
  })

  const createQuoteReference = async () => {
    const postResponse = await createQuote(getServer())
    return JSON.parse(postResponse.payload).reference
  }

  describe('with an expired token that belongs to the quote', () => {
    it('returns 200 with a masked-email confirmation message', async () => {
      const reference = await createQuoteReference()
      const token = await issueAccessToken({
        server: getServer(),
        reference,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      })

      const response = await sendResendKnownRequest({
        server: getServer(),
        reference,
        token
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body.ok).toBe(true)
      expect(body.message).toBe(
        "We've sent a new link to dev**@housebuilder.com"
      )
    })

    it('issues a new token and expires the previous one', async () => {
      const reference = await createQuoteReference()
      const token = await issueAccessToken({
        server: getServer(),
        reference,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      })

      await sendResendKnownRequest({ server: getServer(), reference, token })

      const rows = await getAccessTokenRowsForReference({
        server: getServer(),
        reference
      })
      expect(rows).toHaveLength(2)
      const liveRows = rows.filter((r) => new Date(r.expires_at) > new Date())
      expect(liveRows).toHaveLength(1)
    })

    it('sends the email', async () => {
      const reference = await createQuoteReference()
      const token = await issueAccessToken({
        server: getServer(),
        reference,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      })

      await sendResendKnownRequest({ server: getServer(), reference, token })

      expect(notifySendEmail).toHaveBeenCalled()
    })

    it('returns the generic response without a sent message when Notify rejects the email', async () => {
      notifySendEmail.mockRejectedValue(new Error('Notify unavailable'))
      const reference = await createQuoteReference()
      const token = await issueAccessToken({
        server: getServer(),
        reference,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      })

      const response = await sendResendKnownRequest({
        server: getServer(),
        reference,
        token
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(JSON.parse(response.payload)).toEqual({ ok: true })
    })
  })

  describe('with a token that does not match the quote', () => {
    it('returns a generic 200 success with no email and issues no new token', async () => {
      const reference = await createQuoteReference()
      await issueAccessToken({ server: getServer(), reference })

      const response = await sendResendKnownRequest({
        server: getServer(),
        reference,
        token: 'a-token-that-was-never-issued'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body).toEqual({ ok: true })
      expect(notifySendEmail).not.toHaveBeenCalled()

      const rows = await getAccessTokenRowsForReference({
        server: getServer(),
        reference
      })
      expect(rows).toHaveLength(1)
    })
  })

  describe('when the quote reference does not resolve', () => {
    it('returns a generic 200 success and sends no email', async () => {
      const response = await sendResendKnownRequest({
        server: getServer(),
        reference: 'NRF-999999',
        token: 'any-token'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(JSON.parse(response.payload)).toEqual({ ok: true })
      expect(notifySendEmail).not.toHaveBeenCalled()
    })

    it('returns 400 when the reference format is invalid', async () => {
      const response = await sendResendKnownRequest({
        server: getServer(),
        reference: 'INVALID',
        token: 'any-token'
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })
  })

  it('returns 400 when the token is missing from the body', async () => {
    const reference = await createQuoteReference()

    const response = await getServer().inject({
      method: 'POST',
      url: `/quotes/${reference}/resend-known`,
      payload: {}
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
