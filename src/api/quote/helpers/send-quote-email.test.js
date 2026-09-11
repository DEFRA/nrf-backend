import { sendQuoteEmail } from './send-quote-email.js'
import { sendEmail } from '../../../services/send-email/send-email-client.js'

vi.mock('../../../services/send-email/send-email-client.js')

describe('sendQuoteEmail', () => {
  const recipientEmailAddress = 'test@example.com'
  const nrfQuoteReference = 'NRL-2024-001'
  const edps = [
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
  const housingUnits = 5
  const planningType = 'full-planning-permission'
  const nrfServiceUrl = 'http://localhost:3000'
  const quoteAccessLink = 'http://localhost:3000/quote/NRL-2024-001/abc123token'

  const baseArgs = {
    recipientEmailAddress,
    nrfQuoteReference,
    nrfServiceUrl,
    edps,
    housingUnits,
    planningType,
    quoteAccessLink
  }

  it('calls sendEmail with the correct arguments', async () => {
    await sendQuoteEmail(baseArgs)
    expect(sendEmail).toHaveBeenCalledWith({
      recipientEmailAddress,
      emailReference: nrfQuoteReference,
      emailBodyVariables: {
        nrfQuoteReference,
        edpNames: 'Norfolk Fens east',
        housingUnits,
        planningType: 'full planning permission',
        levyAmount: '£1,100.00',
        levyAmountInflationAdjusted: '£1,122.00',
        nrfServiceUrl,
        quoteAccessLink
      },
      templateId: expect.any(String)
    })
  })

  it('defaults the Notify email reference to the quote reference', async () => {
    await sendQuoteEmail(baseArgs)

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ emailReference: nrfQuoteReference })
    )
  })

  it('uses a supplied emailReference without changing the reference shown in the email body', async () => {
    await sendQuoteEmail({
      ...baseArgs,
      emailReference: `${nrfQuoteReference}-retry-1`
    })

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailReference: `${nrfQuoteReference}-retry-1`,
        emailBodyVariables: expect.objectContaining({ nrfQuoteReference })
      })
    )
  })

  it('lists multiple EDP names', async () => {
    const args = {
      ...baseArgs,
      edps: [
        {
          edpName: 'One',
          levyGbp: {
            amountExcludingVat: 1100,
            amountInflationAdjusted: 1122,
            baseAmount: 1000,
            modelVersion: 1
          }
        },
        {
          edpName: 'Two',
          levyGbp: {
            amountExcludingVat: 1100,
            amountInflationAdjusted: 1122,
            baseAmount: 1000,
            modelVersion: 1
          }
        }
      ]
    }
    await sendQuoteEmail(args)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailBodyVariables: expect.objectContaining({
          edpNames: 'One, Two'
        })
      })
    )
  })

  it('returns the result of sendEmail', async () => {
    const sendEmailResult = {
      notificationId: 'test-notification-id',
      sentDateTime: '2024-01-01T00:00:00.000Z'
    }
    vi.mocked(sendEmail).mockResolvedValue(sendEmailResult)
    const result = await sendQuoteEmail(baseArgs)
    expect(result).toBe(sendEmailResult)
  })
})
