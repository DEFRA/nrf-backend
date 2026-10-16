import { sendRetrieveQuoteEmail } from './send-retrieve-quote-email.js'
import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'

vi.mock('../../../services/send-email/send-email-client.js')

describe('sendRetrieveQuoteEmail', () => {
  const recipientEmailAddress = 'test@example.com'
  const retrieveQuoteUrl =
    'http://localhost:3000/retrieve/NRL-000001/abc123token'

  it('sends the magic link using the retrieve quote template and no client reference', async () => {
    await sendRetrieveQuoteEmail({
      recipientEmailAddress,
      retrieveQuoteUrl
    })

    expect(sendEmail).toHaveBeenCalledWith({
      recipientEmailAddress,
      emailBodyVariables: { retrieveQuoteUrl },
      templateId: config.get('notify.templateIds.retrieveQuote')
    })
  })

  it('uses a different template from the quote results email', () => {
    expect(config.get('notify.templateIds.retrieveQuote')).not.toBe(
      config.get('notify.templateIds.quote')
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
