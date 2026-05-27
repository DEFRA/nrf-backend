import { dbIssueQuoteAccessToken } from './issue-quote-access-token.js'

describe('dbIssueQuoteAccessToken', () => {
  const quoteId = 42
  const tokenHash = 'abc123hash'

  it('should expire any active tokens for the quote', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbIssueQuoteAccessToken({ db, quoteId, tokenHash })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE quote_access_tokens'),
      [quoteId]
    )
  })

  it('should insert a new token row', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbIssueQuoteAccessToken({ db, quoteId, tokenHash })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quote_access_tokens'),
      [tokenHash, quoteId]
    )
  })

  it('should expire existing tokens before inserting the new one', async () => {
    const callOrder = []
    const db = {
      query: vi.fn().mockImplementation((sql) => {
        if (sql.includes('UPDATE')) {
          callOrder.push('update')
        }
        if (sql.includes('INSERT')) {
          callOrder.push('insert')
        }
        return { rows: [] }
      })
    }

    await dbIssueQuoteAccessToken({ db, quoteId, tokenHash })

    expect(callOrder).toEqual(['update', 'insert'])
  })
})
