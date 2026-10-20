import { dbUpdateEmailNotificationForRetry } from './update-email-notification-for-retry.js'

describe('dbUpdateEmailNotificationForRetry', () => {
  it('bumps retry_count, swaps notification_id and nulls delivery fields when Notify accepted the send', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationForRetry({
      db,
      id: 7,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537'
    })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('UPDATE quote_email_notifications')
    expect(sql).toContain('retry_count = retry_count + 1')
    expect(sql).toContain('notification_id = COALESCE($2, notification_id)')
    expect(sql).toContain('notify_send_status = CASE WHEN $2 IS NULL')
    expect(params).toEqual([7, '47cbb989-9546-418c-8828-232c3dc57537'])
  })

  it('bumps retry_count only when Notify rejected the send (null notificationId)', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationForRetry({ db, id: 7, notificationId: null })

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [7, null])
  })
})
