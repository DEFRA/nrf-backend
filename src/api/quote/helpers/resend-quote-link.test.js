import { resendQuoteLink } from './resend-quote-link.js'
import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { recordEmailNotification } from './record-email-notification.js'
import { sendQuoteEmail } from './send-quote-email.js'
import { config } from '../../../config.js'

vi.mock('../../../services/db/quote-access-tokens/issue-quote-access-token.js')
vi.mock('./record-email-notification.js')
vi.mock('./send-quote-email.js')

describe('resendQuoteLink', () => {
  const db = { query: vi.fn() }
  const quote = {
    id: 42,
    reference: 'NRL-000001',
    planningType: 'full-planning-permission',
    housingUnits: 5,
    email: { address: 'adeola@example.com' },
    edps: [
      {
        edpName: 'Norfolk Fens east',
        levyGbp: {
          amountExcludingVat: 1100,
          amountInflationAdjusted: 1122,
          baseAmount: 1000,
          modelVersion: 1
        }
      }
    ]
  }

  beforeEach(() => {
    vi.mocked(recordEmailNotification).mockResolvedValue(undefined)
  })

  it('issues a new token, emails a fresh access link and records the notification as a resend', async () => {
    const emailResult = {
      notificationId: 'abc',
      sentDateTime: '2026-06-05T00:00:00.000Z'
    }
    sendQuoteEmail.mockResolvedValue(emailResult)

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
        nrfQuoteReference: 'NRL-000001',
        nrfServiceUrl: frontEndBaseUrl,
        edps: quote.edps,
        housingUnits: quote.housingUnits,
        planningType: quote.planningType,
        quoteAccessLink: expect.stringMatching(
          /\/quote\/NRL-000001\/[A-Za-z0-9_-]{43}$/
        )
      })
    )
    expect(recordEmailNotification).toHaveBeenCalledWith({
      db,
      quoteId: quote.id,
      emailResult,
      emailType: 'resend_quote_link'
    })
    expect(emailSent).toBe(true)
  })

  it('returns false and still delegates to recordEmailNotification when Notify rejects the email', async () => {
    sendQuoteEmail.mockResolvedValue(null)

    const emailSent = await resendQuoteLink({ db, quote })

    expect(recordEmailNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        emailResult: null,
        emailType: 'resend_quote_link'
      })
    )
    expect(emailSent).toBe(false)
  })

  it('issues the token before sending the email so the link is live when received', async () => {
    const callOrder = []
    dbIssueQuoteAccessToken.mockImplementation(() => {
      callOrder.push('issue')
    })
    sendQuoteEmail.mockImplementation(() => {
      callOrder.push('send')
      return { notificationId: 'abc', sentDateTime: '2026-06-05T00:00:00.000Z' }
    })

    await resendQuoteLink({ db, quote })

    expect(callOrder).toEqual(['issue', 'send'])
  })
})
