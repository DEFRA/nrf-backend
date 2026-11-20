import { withQuoteLock } from './with-quote-lock.js'

describe('withQuoteLock', () => {
  const quoteId = 7

  const setup = () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn()
    }
    return { client, db: { connect: vi.fn().mockResolvedValue(client) } }
  }

  const statements = (client) =>
    client.query.mock.calls.map(([sql]) => sql.replace(/\s+/g, ' ').trim())

  it('locks the quote, runs the work and commits', async () => {
    const { client, db } = setup()
    const work = vi.fn().mockResolvedValue('done')

    const result = await withQuoteLock({ db, quoteId, work })

    expect(result).toBe('done')
    expect(work).toHaveBeenCalledWith(client)
    expect(statements(client)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      'COMMIT'
    ])
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_xact_lock($1)',
      [quoteId]
    )
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back, releases the connection and rethrows when the work fails', async () => {
    const { client, db } = setup()
    const error = new Error('insert failed')

    await expect(
      withQuoteLock({ db, quoteId, work: vi.fn().mockRejectedValue(error) })
    ).rejects.toThrow(error)

    expect(statements(client)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      'ROLLBACK'
    ])
    expect(client.release).toHaveBeenCalled()
  })
})
