import { dbDeleteQuote } from './delete-quote.js'

describe('dbDeleteQuote', () => {
  it('deletes by quote id and reports a row was removed', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) }

    const result = await dbDeleteQuote({ db, id: 42 })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toBe('DELETE FROM quotes WHERE id = $1')
    expect(params).toEqual([42])
    expect(result).toBe(true)
  })

  it('reports no row was removed when the quote does not exist', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) }

    const result = await dbDeleteQuote({ db, id: 42 })

    expect(result).toBe(false)
  })
})
