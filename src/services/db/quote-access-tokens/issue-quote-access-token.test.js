import { dbIssueQuoteAccessToken } from './issue-quote-access-token.js'

describe('dbIssueQuoteAccessToken', () => {
  const quoteId = 42
  const tokenHash = 'abc123hash'

  it('should expire active tokens and insert the new one in a single statement', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbIssueQuoteAccessToken({ db, quoteId, tokenHash })

    expect(db.query).toHaveBeenCalledTimes(1)
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('UPDATE quote_access_tokens')
    expect(sql).toContain('INSERT INTO quote_access_tokens')
    expect(params).toEqual([tokenHash, quoteId])
  })

  it('should expire existing tokens before inserting the new one', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbIssueQuoteAccessToken({ db, quoteId, tokenHash })

    const [sql] = db.query.mock.calls[0]
    expect(sql.indexOf('UPDATE')).toBeLessThan(sql.indexOf('INSERT'))
  })
})
