import { randomUUID } from 'node:crypto'

import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { config } from '../../config.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  issueAccessToken,
  redeemToken,
  sendEmailQuoteLinkRequest,
  getAccessTokenRowsForReference,
  getEmailNotificationRowsForReference
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

const OWNER_EMAIL = 'developer@housebuilder.com'
const UNKNOWN_REFERENCE = 'NRL-999999'

describe('Email quote link endpoint', () => {
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

  const createQuoteReference = async () => {
    const postResponse = await createQuote(getServer())
    return JSON.parse(postResponse.payload).reference
  }

  const emailQuoteLink = (params) =>
    sendEmailQuoteLinkRequest({ server: getServer(), ...params })

  const tokenFromEmail = () => {
    const [, , options] = notifySendEmail.mock.calls.at(-1)
    return options.personalisation.retrieveQuoteUrl.split('/').pop()
  }

  describe('when the reference and email match a quote', () => {
    it('reports a match and emails a magic link using the retrieve template', async () => {
      const reference = await createQuoteReference()

      const response = await emailQuoteLink({ reference, email: OWNER_EMAIL })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(JSON.parse(response.payload)).toEqual({ matched: true })
      expect(notifySendEmail).toHaveBeenCalledTimes(1)
      const [templateId, recipient, options] = notifySendEmail.mock.calls[0]
      expect(templateId).toBe(config.get('notify.templateIds.retrieveQuote'))
      expect(recipient).toBe(OWNER_EMAIL)
      expect(options.personalisation.retrieveQuoteUrl).toContain(
        `/request-to-use/retrieve/${reference}/`
      )
    })

    it('matches the email ignoring case', async () => {
      const reference = await createQuoteReference()

      const response = await emailQuoteLink({
        reference,
        email: OWNER_EMAIL.toUpperCase()
      })

      expect(JSON.parse(response.payload)).toEqual({ matched: true })
    })

    it('issues a single-use token that the emailed link redeems once', async () => {
      const reference = await createQuoteReference()

      await emailQuoteLink({ reference, email: OWNER_EMAIL })
      const token = tokenFromEmail()
      const params = { server: getServer(), reference, token }

      expect((await redeemToken(params)).accessStatus).toBe('valid')
      expect((await redeemToken(params)).accessStatus).toBe('expired')
    })

    it('expires an earlier token and records a retrieve notification', async () => {
      const reference = await createQuoteReference()
      const earlierToken = await issueAccessToken({
        server: getServer(),
        reference
      })

      await emailQuoteLink({ reference, email: OWNER_EMAIL })

      const tokens = await getAccessTokenRowsForReference({
        server: getServer(),
        reference
      })
      expect(tokens).toHaveLength(2)
      expect(
        tokens.filter((t) => new Date(t.expires_at) > new Date())
      ).toHaveLength(1)
      expect(
        (
          await redeemToken({
            server: getServer(),
            reference,
            token: earlierToken
          })
        ).accessStatus
      ).toBe('expired')
      const notifications = await getEmailNotificationRowsForReference({
        server: getServer(),
        reference
      })
      expect(notifications.map((n) => n.email_type)).toContain(
        'retrieve_quote_link'
      )
    })

    it('responds as if the email was sent when Notify rejects it, so a match is not revealed', async () => {
      const reference = await createQuoteReference()
      notifySendEmail.mockRejectedValue(new Error('rejected'))

      const response = await emailQuoteLink({ reference, email: OWNER_EMAIL })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(JSON.parse(response.payload)).toEqual({ matched: true })
    })

    it('records the failed send without a Notify id so it can be retried', async () => {
      const reference = await createQuoteReference()
      notifySendEmail.mockRejectedValue(new Error('rejected'))

      await emailQuoteLink({ reference, email: OWNER_EMAIL })

      const notifications = await getEmailNotificationRowsForReference({
        server: getServer(),
        reference
      })
      expect(notifications).toEqual([
        expect.objectContaining({
          email_type: 'retrieve_quote_link',
          notification_id: null
        })
      ])
    })
  })

  describe('when nothing matches', () => {
    it.each([
      ['the email is not the quote owner', 'someone.else@example.com'],
      ['the reference does not exist', OWNER_EMAIL]
    ])('reports no match and sends nothing when %s', async (name, email) => {
      const reference =
        name === 'the reference does not exist'
          ? UNKNOWN_REFERENCE
          : await createQuoteReference()

      const response = await emailQuoteLink({ reference, email })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(JSON.parse(response.payload)).toEqual({ matched: false })
      expect(notifySendEmail).not.toHaveBeenCalled()
      if (reference !== UNKNOWN_REFERENCE) {
        const tokens = await getAccessTokenRowsForReference({
          server: getServer(),
          reference
        })
        expect(tokens).toHaveLength(0)
      }
    })
  })

  it.each([
    ['the reference format is invalid', 'INVALID', OWNER_EMAIL],
    ['the email format is invalid', UNKNOWN_REFERENCE, 'not-an-email'],
    ['the email is missing', UNKNOWN_REFERENCE, undefined]
  ])('returns 400 when %s', async (_name, reference, email) => {
    const response = await emailQuoteLink({ reference, email })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
