import { dbQuoteAccessTokenExists } from './quote-access-token-exists.js'

describe('dbQuoteAccessTokenExists', () => {
  const tokenHash = 'abc123hash'
  const quoteId = 42

  it('queries by token hash and quote id without mutating', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbQuoteAccessTokenExists({ db, tokenHash, quoteId })

    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('SELECT')
    expect(sql).not.toContain('UPDATE')
    expect(params).toEqual([tokenHash, quoteId])
  })

  it.each([
    ['a row matches', [{ '?column?': 1 }], true],
    ['no row matches', [], false]
  ])('returns the outcome when %s', async (_name, rows, expected) => {
    const db = { query: vi.fn().mockResolvedValue({ rows }) }

    const result = await dbQuoteAccessTokenExists({ db, tokenHash, quoteId })

    expect(result).toBe(expected)
  })
})
