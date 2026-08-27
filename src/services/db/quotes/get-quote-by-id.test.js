import { dbGetQuoteById } from './get-quote-by-id.js'

describe('dbGetQuoteById', () => {
  it('selects by quote id reusing the shared quote select SQL', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    const result = await dbGetQuoteById({ db, id: 42 })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('FROM quotes q')
    expect(sql).toContain('WHERE q.id = $1')
    expect(params).toEqual([42])
    expect(result).toBeNull()
  })
})
