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
  const development = {
    types: ['housing'],
    residentialBuildingCount: 5,
    peopleCount: null
  }
  const nrfServiceUrl = 'http://localhost:3000'
  const quoteAccessLink = 'http://localhost:3000/quote/NRF-2024-001/abc123token'

  it('calls sendEmail with the correct arguments', () => {
    sendQuoteEmail({
      recipientEmailAddress,
      nrfQuoteReference,
      nrfServiceUrl,
      edps,
      development,
      quoteAccessLink
    })
    expect(sendEmail).toHaveBeenCalledWith({
      recipientEmailAddress,
      emailReference: nrfQuoteReference,
      emailBodyVariables: {
        nrfQuoteReference,
        edpNames: 'Norfolk Fens east',
        developmentDescription: 'Housing with a total of 5 residential units',
        levyAmount: '£100 - £200',
        nrfServiceUrl,
        quoteAccessLink
      },
      templateId: 'f6a9c35d-f189-452a-80f6-bc05bf00b11c'
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
      development,
      quoteAccessLink
    })
    expect(result).toBe(sendEmailResult)
  })
})
