import { resendQuoteLink } from './resend-quote-link.js'
import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { dbUpdateQuoteWithEmailSent } from '../../../services/db/quotes/update-quote-with-email-sent.js'
import { dbCreateEmailNotification } from '../../../services/db/quote-email-notifications/create-email-notification.js'
import { sendQuoteEmail } from './send-quote-email.js'
import { config } from '../../../config.js'

vi.mock('../../../services/db/quote-access-tokens/issue-quote-access-token.js')
vi.mock('../../../services/db/quotes/update-quote-with-email-sent.js')
vi.mock(
  '../../../services/db/quote-email-notifications/create-email-notification.js'
)
vi.mock('./send-quote-email.js')

describe('resendQuoteLink', () => {
  const db = { query: vi.fn() }
  const quote = {
    id: 42,
    reference: 'NRF-000001',
    planningType: 'full-planning-permission',
    housingUnits: 5,
    email: { address: 'adeola@example.com' },
    edps: [{ edpName: 'Norfolk Fens east', levyGbp: { min: 100, max: 200 } }]
  }

  it('issues a new token and emails a fresh access link to the quote owner', async () => {
    sendQuoteEmail.mockResolvedValue({
      notificationId: 'abc',
      sentDateTime: '2026-06-05T00:00:00.000Z'
    })

    const emailSent = await resendQuoteLink({ db, quote })

    expect(dbIssueQuoteAccessToken).toHaveBeenCalledWith({
      db,
      quoteId: quote.id,
      tokenHash: expect.any(String)
    })

    const frontEndBaseUrl = config.get('frontEndBaseUrl')
    expect(sendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmailAddress: 'adeola@example.com',
        nrfQuoteReference: 'NRF-000001',
        nrfServiceUrl: frontEndBaseUrl,
        edps: quote.edps,
        housingUnits: quote.housingUnits,
        planningType: quote.planningType,
        quoteAccessLink: expect.stringMatching(
          /\/quote\/NRF-000001\/[A-Za-z0-9_-]{43}$/
        )
      })
    )
    expect(emailSent).toBe(true)
  })

  it('records the Notify notification id as a resend', async () => {
    sendQuoteEmail.mockResolvedValue({
      notificationId: 'abc',
      sentDateTime: '2026-06-05T00:00:00.000Z'
    })

    await resendQuoteLink({ db, quote })

    expect(dbCreateEmailNotification).toHaveBeenCalledWith({
      db,
      quoteId: quote.id,
      notificationId: 'abc',
      emailType: 'resend'
    })
  })

  it('advances the email send timestamp on a successful resend', async () => {
    sendQuoteEmail.mockResolvedValue({
      notificationId: 'abc',
      sentDateTime: '2026-06-05T00:00:00.000Z'
    })

    await resendQuoteLink({ db, quote })

    expect(dbUpdateQuoteWithEmailSent).toHaveBeenCalledWith({
      db,
      reference: quote.reference,
      data: { emailSendRequestAt: '2026-06-05T00:00:00.000Z' }
    })
  })

  it('returns true even when recording the notification id fails', async () => {
    sendQuoteEmail.mockResolvedValue({
      notificationId: 'abc',
      sentDateTime: '2026-06-05T00:00:00.000Z'
    })
    dbCreateEmailNotification.mockRejectedValue(new Error('db blip'))

    const emailSent = await resendQuoteLink({ db, quote })

    expect(emailSent).toBe(true)
  })

  it('returns true even when recording the send timestamp fails', async () => {
    sendQuoteEmail.mockResolvedValue({
      notificationId: 'abc',
      sentDateTime: '2026-06-05T00:00:00.000Z'
    })
    dbUpdateQuoteWithEmailSent.mockRejectedValue(new Error('db blip'))

    const emailSent = await resendQuoteLink({ db, quote })

    expect(emailSent).toBe(true)
  })

  it('does not record a notification when Notify rejects the email', async () => {
    sendQuoteEmail.mockResolvedValue(null)

    await resendQuoteLink({ db, quote })

    expect(dbCreateEmailNotification).not.toHaveBeenCalled()
  })

  it('returns false when Notify rejects the email', async () => {
    sendQuoteEmail.mockResolvedValue(null)

    const emailSent = await resendQuoteLink({ db, quote })

    expect(emailSent).toBe(false)
  })

  it('issues the token before sending the email so the link is live when received', async () => {
    const callOrder = []
    dbIssueQuoteAccessToken.mockImplementation(() => {
      callOrder.push('issue')
    })
    sendQuoteEmail.mockImplementation(() => {
      callOrder.push('send')
    })

    await resendQuoteLink({ db, quote })

    expect(callOrder).toEqual(['issue', 'send'])
  })
})
