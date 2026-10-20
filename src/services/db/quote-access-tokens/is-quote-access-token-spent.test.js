import { dbIsQuoteAccessTokenSpent } from './is-quote-access-token-spent.js'

describe('dbIsQuoteAccessTokenSpent', () => {
  const tokenHash = 'abc123hash'
  const quoteId = 42

  it('looks for a used or expired token scoped to token and quote', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbIsQuoteAccessTokenSpent({ db, tokenHash, quoteId })

    const [sql, params] = db.query.mock.calls[0]
    const normalised = sql.replace(/\s+/g, ' ')
    expect(normalised).toContain('FROM quote_access_tokens')
    expect(normalised).toContain(
      'redeemed_at IS NOT NULL OR expires_at <= now()'
    )
    expect(params).toEqual([tokenHash, quoteId])
  })

  it('returns true when a spent token matches', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{}] }) }

    expect(await dbIsQuoteAccessTokenSpent({ db, tokenHash, quoteId })).toBe(
      true
    )
  })

  it('returns false when no spent token matches', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    expect(await dbIsQuoteAccessTokenSpent({ db, tokenHash, quoteId })).toBe(
      false
    )
  })
})
