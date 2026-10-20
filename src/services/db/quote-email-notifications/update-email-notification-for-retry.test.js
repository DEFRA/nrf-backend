import { dbUpdateEmailNotificationForRetry } from './update-email-notification-for-retry.js'

describe('dbUpdateEmailNotificationForRetry', () => {
  it('bumps retry_count, swaps notification_id and nulls delivery fields when Notify accepted the send, appending the attempt in the same statement', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationForRetry({
      db,
      id: 7,
      notificationId: '47cbb989-9546-418c-8828-232c3dc57537'
    })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('WITH updated AS')
    expect(sql).toContain('UPDATE quote_email_notifications')
    expect(sql).toContain('retry_count = retry_count + 1')
    expect(sql).toContain('notification_id = COALESCE($2, notification_id)')
    expect(sql).toContain('notify_send_status = CASE WHEN $2 IS NULL')
    expect(sql).toContain('RETURNING id, retry_count')
    expect(sql).toContain(
      'INSERT INTO quote_email_notification_attempts (email_notification_id, attempt_no, notification_id)'
    )
    expect(sql).toContain('SELECT id, retry_count + 1, $2 FROM updated')
    expect(params).toEqual([7, '47cbb989-9546-418c-8828-232c3dc57537'])
  })

  it('bumps retry_count only when Notify rejected the send (null notificationId), still appending an attempt row with a null id', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateEmailNotificationForRetry({ db, id: 7, notificationId: null })

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [7, null])
  })
})
