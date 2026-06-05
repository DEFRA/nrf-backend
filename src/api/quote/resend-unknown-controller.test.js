import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  sendResendUnknownRequest,
  getAccessTokenRowsForReference
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

const genericMessage = "If a matching quote is found, we've sent a new link."

describe('Resend unknown quote link endpoint', () => {
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

  describe('with an email that matches the quote owner', () => {
    it('returns 200 with the generic confirmation message', async () => {
      const reference = await createQuoteReference()

      const response = await sendResendUnknownRequest({
        server: getServer(),
        reference,
        email: 'developer@housebuilder.com'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(JSON.parse(response.payload)).toEqual({
        ok: true,
        message: genericMessage
      })
    })

    it('issues a new token and sends the email', async () => {
      const reference = await createQuoteReference()

      await sendResendUnknownRequest({
        server: getServer(),
        reference,
        email: 'developer@housebuilder.com'
      })

      expect(notifySendEmail).toHaveBeenCalled()
      const rows = await getAccessTokenRowsForReference({
        server: getServer(),
        reference
      })
      expect(rows).toHaveLength(1)
    })

    it('matches the email case-insensitively', async () => {
      const reference = await createQuoteReference()

      await sendResendUnknownRequest({
        server: getServer(),
        reference,
        email: 'DEVELOPER@housebuilder.com'
      })

      expect(notifySendEmail).toHaveBeenCalled()
    })
  })

  describe('with an email that does not match the quote owner', () => {
    it('returns the same generic message but sends no email and issues no token', async () => {
      const reference = await createQuoteReference()

      const response = await sendResendUnknownRequest({
        server: getServer(),
        reference,
        email: 'someone-else@example.com'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(JSON.parse(response.payload)).toEqual({
        ok: true,
        message: genericMessage
      })
      expect(notifySendEmail).not.toHaveBeenCalled()

      const rows = await getAccessTokenRowsForReference({
        server: getServer(),
        reference
      })
      expect(rows).toHaveLength(0)
    })
  })

  describe('when the quote reference does not resolve', () => {
    it('returns an identical generic response and sends no email', async () => {
      const response = await sendResendUnknownRequest({
        server: getServer(),
        reference: 'NRF-999999',
        email: 'developer@housebuilder.com'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(JSON.parse(response.payload)).toEqual({
        ok: true,
        message: genericMessage
      })
      expect(notifySendEmail).not.toHaveBeenCalled()
    })

    it('returns 400 when the reference format is invalid', async () => {
      const response = await sendResendUnknownRequest({
        server: getServer(),
        reference: 'INVALID',
        email: 'developer@housebuilder.com'
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })
  })

  it('accepts a reserved-TLD email and returns the generic response, matching the frontend validation', async () => {
    const response = await sendResendUnknownRequest({
      server: getServer(),
      reference: 'NRF-999999',
      email: 'someone@nowhere.example'
    })

    expect(response.statusCode).toBe(statusCodes.ok)
    expect(JSON.parse(response.payload)).toEqual({
      ok: true,
      message: genericMessage
    })
  })

  it('returns 400 when the email is missing from the body', async () => {
    const reference = await createQuoteReference()

    const response = await getServer().inject({
      method: 'POST',
      url: `/quotes/${reference}/resend-unknown`,
      payload: {}
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
