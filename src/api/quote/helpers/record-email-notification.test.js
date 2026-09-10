import { recordEmailNotification } from './record-email-notification.js'
import { dbCreateEmailNotification } from '../../../services/db/quote-email-notifications/create-email-notification.js'

vi.mock(
  '../../../services/db/quote-email-notifications/create-email-notification.js'
)

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn()
}))
vi.mock('../../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}))

describe('recordEmailNotification', () => {
  const db = { query: vi.fn() }
  const RESEND_QUOTE_LINK = 'resend_quote_link'

  it('inserts a row with null notificationId when the Notify send failed', async () => {
    await recordEmailNotification({
      db,
      quoteId: 42,
      emailResult: null,
      emailType: RESEND_QUOTE_LINK
    })
    expect(dbCreateEmailNotification).toHaveBeenCalledWith({
      db,
      quoteId: 42,
      notificationId: null,
      emailType: RESEND_QUOTE_LINK
    })
  })

  it('inserts a notification row with the correct args when the email was accepted', async () => {
    await recordEmailNotification({
      db,
      quoteId: 42,
      emailResult: { notificationId: 'abc-123' },
      emailType: RESEND_QUOTE_LINK
    })
    expect(dbCreateEmailNotification).toHaveBeenCalledWith({
      db,
      quoteId: 42,
      notificationId: 'abc-123',
      emailType: RESEND_QUOTE_LINK
    })
  })

  it('logs and swallows a db error so the caller does not observe a failure after Notify accepted the send', async () => {
    vi.mocked(dbCreateEmailNotification).mockRejectedValue(new Error('db blip'))

    await expect(
      recordEmailNotification({
        db,
        quoteId: 42,
        emailResult: { notificationId: 'abc-123' },
        emailType: 'quote_results'
      })
    ).resolves.toBeUndefined()

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(Error),
      expect.any(String)
    )
  })
})
