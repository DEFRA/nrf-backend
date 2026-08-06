import { sendQuoteEmail } from './send-quote-email.js'
import { sendEmail } from '../../../services/send-email/send-email-client.js'

vi.mock('../../../services/send-email/send-email-client.js')

describe('sendQuoteEmail', () => {
  const recipientEmailAddress = 'test@example.com'
  const nrfQuoteReference = 'NRF-2024-001'
  const edps = [
    {
      edpName: 'Norfolk Fens east',
      levyGbp: { min: 100, max: 200 }
    }
  ]
  const housingUnits = 5
  const planningType = 'full-planning-permission'
  const nrfServiceUrl = 'http://localhost:3000'
  const quoteAccessLink = 'http://localhost:3000/quote/NRF-2024-001/abc123token'

  it('calls sendEmail with the correct arguments', () => {
    sendQuoteEmail({
      recipientEmailAddress,
      nrfQuoteReference,
      nrfServiceUrl,
      edps,
      housingUnits,
      planningType,
      quoteAccessLink
    })
    expect(sendEmail).toHaveBeenCalledWith({
      recipientEmailAddress,
      emailReference: nrfQuoteReference,
      emailBodyVariables: {
        nrfQuoteReference,
        edpNames: expect.any(Array),
        housingUnits,
        planningType: 'full planning permission',
        levyAmount: '£100 - £200',
        nrfServiceUrl,
        quoteAccessLink
      },
      templateId: expect.any(String)
    })
  })

  it('returns the result of sendEmail', async () => {
    const sendEmailResult = {
      notificationId: 'test-notification-id',
      sentDateTime: '2024-01-01T00:00:00.000Z'
    }
    vi.mocked(sendEmail).mockResolvedValue(sendEmailResult)
    const result = await sendQuoteEmail({
      recipientEmailAddress,
      nrfQuoteReference,
      nrfServiceUrl,
      edps,
      housingUnits,
      planningType,
      quoteAccessLink
    })
    expect(result).toBe(sendEmailResult)
  })
})
