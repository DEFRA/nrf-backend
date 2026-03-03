import { sendQuoteEmail } from './send-quote-email.js'
import { sendEmail } from '../../../services/send-email/send-email-client.js'

vi.mock('../../../services/send-email/send-email-client.js')

describe('sendQuoteEmail', () => {
  const recipientEmailAddress = 'test@example.com'
  const nrfQuoteReference = 'NRF-2024-001'

  it('calls sendEmail with the correct arguments', () => {
    sendQuoteEmail({ recipientEmailAddress, nrfQuoteReference })
    expect(sendEmail).toHaveBeenCalledWith({
      recipientEmailAddress,
      emailReference: nrfQuoteReference,
      emailBodyVariables: {
        estimateReference: nrfQuoteReference,
        levyAmount: '£3500',
        monitoringAmount: '£250',
        maintenanceAmount: '£560',
        adminAmount: '£80'
      },
      templateId: 'af6368ca-b1ee-4199-a9da-8fabb0a2d5e8'
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
      nrfQuoteReference
    })
    expect(result).toBe(sendEmailResult)
  })
})
