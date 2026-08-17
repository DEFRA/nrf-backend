import { dbUpdateEmailNotificationStatus } from './update-email-notification-status.js'

describe('dbUpdateEmailNotificationStatus', () => {
  it('updates status, sets checked_at to now, and coalesces sent/completed timestamps', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationStatus({
      db,
      id: 7,
      status: 'delivered',
      sentAt: '2026-08-10T09:00:00.000Z',
      completedAt: '2026-08-10T09:01:00.000Z'
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE quote_email_notifications'),
      [7, 'delivered', '2026-08-10T09:00:00.000Z', '2026-08-10T09:01:00.000Z']
    )
    expect(db.query.mock.calls[0][0]).toContain('status_checked_at = now()')
    expect(db.query.mock.calls[0][0]).toContain(
      'sent_at = COALESCE($3, sent_at)'
    )
  })

  it('passes null for timestamps Notify did not return', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationStatus({
      db,
      id: 7,
      status: 'sending'
    })

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      7,
      'sending',
      null,
      null
    ])
  })
})
