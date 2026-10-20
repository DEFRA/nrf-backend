import { dbUpdateEmailNotificationStatus } from './update-email-notification-status.js'

describe('dbUpdateEmailNotificationStatus', () => {
  it('updates status, sets checked_at to now, and coalesces sent/completed timestamps', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationStatus({
      db,
      id: 7,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537',
      status: 'delivered',
      sentAt: '2026-08-10T09:00:00.000Z',
      completedAt: '2026-08-10T09:01:00.000Z'
    })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('UPDATE quote_email_notifications')
    expect(params).toEqual([
      7,
      'delivered',
      '2026-08-10T09:00:00.000Z',
      '2026-08-10T09:01:00.000Z',
      '47cbb989-9546-418c-8828-232c3dc57537'
    ])
    expect(sql).toContain('status_checked_at = now()')
    expect(sql).toContain('sent_at = COALESCE($3, sent_at)')
  })

  it('also carries the status onto the matching attempt row, matched on the notification id the status was fetched for', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationStatus({
      db,
      id: 7,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537',
      status: 'delivered'
    })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('UPDATE quote_email_notification_attempts')
    expect(sql).toContain('SET notify_send_status = $2')
    expect(sql).toContain('WHERE a.notification_id = $5')
    expect(params[4]).toBe('47cbb989-9546-418c-8828-232c3dc57537')
  })

  it('passes null for timestamps Notify did not return', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationStatus({
      db,
      id: 7,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537',
      status: 'sending'
    })

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      7,
      'sending',
      null,
      null,
      '47cbb989-9546-418c-8828-232c3dc57537'
    ])
  })
})
