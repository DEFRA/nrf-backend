import { dbGetRetryableEmailFailures } from './get-retryable-email-failures.js'

describe('dbGetRetryableEmailFailures', () => {
  it('selects the latest retryable failures with their retry counts, oldest-first and limited', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ quote_id: 42, retry_count: 0 }]
      })
    }

    const result = await dbGetRetryableEmailFailures({
      db,
      limit: 10,
      maxRetryAttempts: 4,
      maxAgeDays: 2
    })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('SELECT n.quote_id, rc.retry_count')
    expect(sql).toContain('COUNT(*)::int AS retry_count')
    expect(sql).toContain("r.email_type IN ('retry', 'retry_rejected')")
    expect(sql).toContain(
      "n.status IN ('temporary-failure', 'technical-failure')"
    )
    expect(sql).toContain('rc.retry_count < $2')
    expect(sql).toContain('LIMIT $1')
    expect(sql).toContain('ORDER BY n.created_at ASC')
    expect(params).toEqual([10, 4, 2])
    expect(result).toEqual([{ quote_id: 42, retry_count: 0 }])
  })

  it('only returns a quote’s latest notification, ignoring superseded failures and rejected attempts', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbGetRetryableEmailFailures({
      db,
      limit: 10,
      maxRetryAttempts: 4,
      maxAgeDays: 2
    })

    const sql = db.query.mock.calls[0][0]
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('newer.created_at > n.created_at')
    expect(sql).toContain("newer.email_type <> 'retry_rejected'")
  })

  it('bounds candidates to the lookback window', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbGetRetryableEmailFailures({
      db,
      limit: 10,
      maxRetryAttempts: 4,
      maxAgeDays: 2
    })

    expect(db.query.mock.calls[0][0]).toContain(
      "n.created_at > now() - ($3 * interval '1 day')"
    )
  })
})
