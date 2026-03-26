import { sendEmail } from './send-email-client.js'
import { createNotifyClient } from './notify-client.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
vi.mock('./notify-client.js')
vi.mock('../../common/helpers/logging/logger.js')

describe('sendEmail', () => {
  let notifySendEmail
  let logger
  const recipientEmailAddress = 'barry@builders.com'
  const estimateReference = 'AN2191'
  const templateId = 'test-template-id'
  const emailBodyVariables = {
    estimateReference,
    levyAmount: '£3500',
    monitoringAmount: '£250',
    maintenanceAmount: '£560',
    adminAmount: '£80'
  }
  const notificationId = '201b576e-c09b-467b-9dfa-9c3b689ee730'

  beforeEach(() => {
    notifySendEmail = vi.fn().mockResolvedValue({
      data: { id: notificationId }
    })
    logger = {
      info: vi.fn(),
      error: vi.fn()
    }
    vi.mocked(createLogger).mockReturnValue(logger)
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: notifySendEmail
    })
  })

  it('calls the notify sendEmail function', async () => {
    await sendEmail({
      recipientEmailAddress,
      emailReference: estimateReference,
      emailBodyVariables,
      templateId
    })
    expect(notifySendEmail).toHaveBeenCalledWith(
      templateId,
      recipientEmailAddress,
      {
        personalisation: {
          adminAmount: '£80',
          estimateReference: 'AN2191',
          levyAmount: '£3500',
          maintenanceAmount: '£560',
          monitoringAmount: '£250'
        },
        reference: 'AN2191'
      }
    )
  })

  it('returns a sent date & time and the notification ID, and logs, if successful', async () => {
    const result = await sendEmail({
      recipientEmailAddress,
      emailReference: estimateReference,
      emailBodyVariables,
      templateId
    })
    expect(result).toEqual({
      notificationId,
      sentDateTime: expect.any(String)
    })
    expect(logger.info).toHaveBeenCalledWith('Notify sendEmail responded', {
      templateId,
      notificationId
    })
  })

  it('returns null and logs the error message, if unsuccessful', async () => {
    const error = new Error('something went wrong')
    notifySendEmail.mockRejectedValue(error)
    const result = await sendEmail({
      recipientEmailAddress,
      emailReference: estimateReference,
      emailBodyVariables,
      templateId
    })
    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      {
        templateId
      },
      `Error thrown in sendEmail: ${error.message}`
    )
  })

  it('returns null and logs the errors array, if the notify client returns errors', async () => {
    const errors = [
      { error: 'BadRequestError', message: 'Invalid email address' }
    ]
    const error = Object.assign(new Error('notify error'), {
      response: { data: { errors } }
    })
    notifySendEmail.mockRejectedValue(error)
    const result = await sendEmail({
      recipientEmailAddress,
      emailReference: estimateReference,
      emailBodyVariables,
      templateId
    })
    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      {
        templateId
      },
      `Notify client sendEmail failed: ${JSON.stringify(errors)}`
    )
  })

  it("returns null and logs, if a notification ID isn't returned", async () => {
    notifySendEmail.mockResolvedValue({
      id: null
    })
    const result = await sendEmail({
      recipientEmailAddress,
      emailReference: estimateReference,
      emailBodyVariables,
      templateId
    })
    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      {
        templateId
      },
      `Error thrown in sendEmail: No notification ID returned`
    )
  })
})
