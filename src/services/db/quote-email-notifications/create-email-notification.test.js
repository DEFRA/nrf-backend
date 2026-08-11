import { dbCreateEmailNotification } from './create-email-notification.js'

describe('dbCreateEmailNotification', () => {
  it('inserts the notification id with the provided email type', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbCreateEmailNotification({
      db,
      quoteId: 42,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537',
      emailType: 'resend'
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quote_email_notifications'),
      [42, '47cbb989-9546-418c-8828-232c3dc57537', 'resend']
    )
    expect(db.query.mock.calls[0][0]).toContain(
      'ON CONFLICT (notification_id) DO NOTHING'
    )
  })

  it('defaults email_type to quote_result', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbCreateEmailNotification({
      db,
      quoteId: 1,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537'
    })

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      1,
      '47cbb989-9546-418c-8828-232c3dc57537',
      'quote_result'
    ])
  })
})
