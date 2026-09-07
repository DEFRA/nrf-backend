import { dbLockQuote } from './lock-quote.js'

describe('dbLockQuote', () => {
  it('takes a row lock on the quote', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }

    await dbLockQuote({ db, quoteId: 7 })

    expect(db.query).toHaveBeenCalledWith(
      'SELECT id FROM quotes WHERE id = $1 FOR UPDATE',
      [7]
    )
  })
})
