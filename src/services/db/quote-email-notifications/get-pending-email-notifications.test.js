import { dbGetPendingEmailNotifications } from './get-pending-email-notifications.js'

describe('dbGetPendingEmailNotifications', () => {
  it('selects id and notification_id ordered oldest-first, limited and age-bounded', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 1, notification_id: 'a'.repeat(36) }]
      })
    }

    const result = await dbGetPendingEmailNotifications({
      db,
      limit: 50,
      maxAgeDays: 14
    })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('SELECT id, notification_id')
    expect(sql).toContain('ORDER BY created_at ASC')
    expect(sql).toContain('LIMIT $1')
    expect(sql).toContain(
      "status NOT IN ('delivered', 'permanent-failure', 'technical-failure')"
    )
    expect(params).toEqual([50, 14])
    expect(result).toEqual([{ id: 1, notification_id: 'a'.repeat(36) }])
  })

  it('includes rows whose status is still null', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbGetPendingEmailNotifications({ db, limit: 10, maxAgeDays: 7 })

    expect(db.query.mock.calls[0][0]).toContain('status IS NULL')
  })
})
