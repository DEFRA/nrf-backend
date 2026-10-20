import { dbCreateEmailNotification } from './create-email-notification.js'

describe('dbCreateEmailNotification', () => {
  it('inserts the notification id with the provided email type', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbCreateEmailNotification({
      db,
      quoteId: 42,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537',
      emailType: 'resend_quote_link'
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quote_email_notifications'),
      [42, '47cbb989-9546-418c-8828-232c3dc57537', 'resend_quote_link']
    )
    expect(db.query.mock.calls[0][0]).toContain(
      'ON CONFLICT (notification_id) DO NOTHING'
    )
    // the initial send's attempt row rides the same statement, so a lifecycle
    // row can never exist without its first attempt
    expect(db.query.mock.calls[0][0]).toContain('WITH inserted AS')
    expect(db.query.mock.calls[0][0]).toContain(
      'INSERT INTO quote_email_notification_attempts (email_notification_id, attempt_no, notification_id)'
    )
    expect(db.query.mock.calls[0][0]).toContain(
      'SELECT id, 1, $2 FROM inserted'
    )
  })

  it('defaults email_type to quote_results', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbCreateEmailNotification({
      db,
      quoteId: 1,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537'
    })

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      1,
      '47cbb989-9546-418c-8828-232c3dc57537',
      'quote_results'
    ])
  })
})
