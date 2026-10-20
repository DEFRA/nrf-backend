import { randomUUID } from 'node:crypto'

import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { config } from '../../config.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuoteWithToken,
  createTimedOutToken,
  createUsedToken,
  getAccessTokenRowsForReference,
  getEmailNotificationRowsForReference,
  redeemToken,
  resendLink,
  sendResendLinkRequest,
  tokenFromLastEmail
} from '../../test-utils/quote-request-helpers.js'
import { validQuotePayload } from '../../test-utils/fixtures/quotePayloads.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

const OWNER_EMAIL = validQuotePayload.email
const UNKNOWN_REFERENCE = 'NRL-999999'

describe('Resend quote link endpoint', () => {
  const getServer = setupTestServer()
  let notifySendEmail

  beforeEach(() => {
    notifySendEmail = vi
      .fn()
      .mockImplementation(async () => ({ data: { id: randomUUID() } }))
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: notifySendEmail
    })
  })

  describe.each([
    ['used', createUsedToken],
    ['timed out', createTimedOutToken]
  ])('when the token has been %s', (_name, createSpentToken) => {
    it('emails a new magic link and returns the address it went to', async () => {
      const { reference, token } = await createSpentToken({
        server: getServer()
      })

      const { statusCode, body } = await resendLink({
        server: getServer(),
        reference,
        token
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(body).toEqual({ matched: true, email: OWNER_EMAIL })
      expect(notifySendEmail).toHaveBeenCalledTimes(1)
      const [templateId, recipient, options] = notifySendEmail.mock.calls[0]
      expect(templateId).toBe(config.get('notify.templateIds.retrieveQuote'))
      expect(recipient).toBe(OWNER_EMAIL)
      expect(options.personalisation.retrieveQuoteUrl).toContain(
        `/request-to-use/retrieve/${reference}/`
      )
    })

    it('issues a new token that the emailed link redeems', async () => {
      const { reference, token } = await createSpentToken({
        server: getServer()
      })

      await resendLink({ server: getServer(), reference, token })

      const newToken = tokenFromLastEmail(notifySendEmail)
      expect(newToken).not.toBe(token)
      const tokens = await getAccessTokenRowsForReference({
        server: getServer(),
        reference
      })
      expect(
        tokens.filter((t) => new Date(t.expires_at) > new Date())
      ).toHaveLength(1)
      expect(
        (await redeemToken({ server: getServer(), reference, token: newToken }))
          .accessStatus
      ).toBe('valid')
    })

    it('records a retrieve notification', async () => {
      const { reference, token } = await createSpentToken({
        server: getServer()
      })

      await resendLink({ server: getServer(), reference, token })

      const notifications = await getEmailNotificationRowsForReference({
        server: getServer(),
        reference
      })
      expect(notifications.map((n) => n.email_type)).toContain(
        'retrieve_quote_link'
      )
    })
  })

  it('expires the link from an earlier resend when the same token asks again', async () => {
    const { reference, token } = await createUsedToken({ server: getServer() })
    await resendLink({ server: getServer(), reference, token })
    const firstResentToken = tokenFromLastEmail(notifySendEmail)

    const { body } = await resendLink({ server: getServer(), reference, token })

    expect(body).toEqual({ matched: true, email: OWNER_EMAIL })
    expect(
      (
        await redeemToken({
          server: getServer(),
          reference,
          token: firstResentToken
        })
      ).accessStatus
    ).toBe('expired')
  })

  it('responds as if the email was sent when Notify rejects it', async () => {
    const { reference, token } = await createUsedToken({ server: getServer() })
    notifySendEmail.mockRejectedValue(new Error('rejected'))

    const { statusCode, body } = await resendLink({
      server: getServer(),
      reference,
      token
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(body).toEqual({ matched: true, email: OWNER_EMAIL })
  })

  describe('when nothing matches', () => {
    it('gives the same response and sends nothing for a token that is still live', async () => {
      const { reference, token } = await createQuoteWithToken({
        server: getServer()
      })

      const { statusCode, body } = await resendLink({
        server: getServer(),
        reference,
        token
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(body).toEqual({ matched: false })
      expect(notifySendEmail).not.toHaveBeenCalled()
    })

    it('gives the same response and sends nothing for a token that was never issued', async () => {
      const { reference } = await createUsedToken({ server: getServer() })

      const { statusCode, body } = await resendLink({
        server: getServer(),
        reference,
        token: 'never-issued'
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(body).toEqual({ matched: false })
      expect(notifySendEmail).not.toHaveBeenCalled()
    })

    it('gives the same response and sends nothing for another quote’s spent token', async () => {
      const { reference } = await createQuoteWithToken({ server: getServer() })
      const { token } = await createUsedToken({ server: getServer() })

      const { body } = await resendLink({
        server: getServer(),
        reference,
        token
      })

      expect(body).toEqual({ matched: false })
      expect(notifySendEmail).not.toHaveBeenCalled()
    })

    it('gives the same response and sends nothing for an unknown reference', async () => {
      const { token } = await createUsedToken({ server: getServer() })

      const { statusCode, body } = await resendLink({
        server: getServer(),
        reference: UNKNOWN_REFERENCE,
        token
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(body).toEqual({ matched: false })
      expect(notifySendEmail).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['the reference format is invalid', 'INVALID', 'some-token'],
    ['the token is missing', UNKNOWN_REFERENCE, undefined]
  ])('returns 400 when %s', async (_name, reference, token) => {
    const response = await sendResendLinkRequest({
      server: getServer(),
      reference,
      token
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
