import { sendRetrieveQuoteEmail } from './send-retrieve-quote-email.js'
import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'

vi.mock('../../../services/send-email/send-email-client.js')

describe('sendRetrieveQuoteEmail', () => {
  const recipientEmailAddress = 'test@example.com'
  const retrieveQuoteUrl =
    'http://localhost:3000/retrieve/NRL-000001/abc123token'
  const nrfQuoteReference = 'NRL-000001'

  it('sends the magic link and quote reference using the retrieve quote template and no client reference', async () => {
    await sendRetrieveQuoteEmail({
      recipientEmailAddress,
      retrieveQuoteUrl,
      nrfQuoteReference
    })

    expect(sendEmail).toHaveBeenCalledWith({
      recipientEmailAddress,
      emailBodyVariables: {
        subject: expect.any(String),
        content: expect.stringContaining(retrieveQuoteUrl)
      },
      templateId: config.get('notify.templateIds.retrieveQuote')
    })
    expect(sendEmail.mock.calls[0][0].emailBodyVariables.content).toContain(
      `NRL reference: ${nrfQuoteReference}`
    )
  })

  it('returns the result of the send', async () => {
    const emailResult = { notificationId: 'n-1', sentDateTime: 'now' }
    vi.mocked(sendEmail).mockResolvedValue(emailResult)

    const result = await sendRetrieveQuoteEmail({
      recipientEmailAddress,
      retrieveQuoteUrl
    })

    expect(result).toBe(emailResult)
  })
})
