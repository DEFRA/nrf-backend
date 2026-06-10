import { dbRedeemQuoteAccessToken } from './redeem-quote-access-token.js'

describe('dbRedeemQuoteAccessToken', () => {
  const tokenHash = 'abc123hash'
  const quoteId = 42

  it('atomically increments the session count scoped to token and quote', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ quote_id: quoteId }] })
    }

    await dbRedeemQuoteAccessToken({ db, tokenHash, quoteId })

    const [sql, params] = db.query.mock.calls[0]
    const normalised = sql.replace(/\s+/g, ' ')
    expect(normalised).toContain('UPDATE quote_access_tokens')
    expect(normalised).toContain('session_count = session_count + 1')
    expect(normalised).toContain(
      'first_viewed_at = COALESCE(first_viewed_at, now())'
    )
    expect(normalised).toContain('expires_at > now()')
    expect(normalised).toContain('session_count < max_sessions')
    expect(params).toEqual([tokenHash, quoteId])
  })

  it('returns redeemed when the update affects a row', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ quote_id: quoteId }] })
    }

    const result = await dbRedeemQuoteAccessToken({ db, tokenHash, quoteId })

    expect(result).toEqual({ redeemed: true, expired: false })
    expect(db.query).toHaveBeenCalledTimes(1)
  })

  it('returns expired when redemption fails and the token is time-expired', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ time_expired: true }] })
    }

    const result = await dbRedeemQuoteAccessToken({ db, tokenHash, quoteId })

    expect(result).toEqual({ redeemed: false, expired: true })
    expect(db.query.mock.calls[1][0]).toContain('FROM quote_access_tokens')
    expect(db.query.mock.calls[1][1]).toEqual([tokenHash, quoteId])
  })

  it('returns not expired when redemption fails because the token is session-exhausted but still live', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ time_expired: false }] })
    }

    const result = await dbRedeemQuoteAccessToken({ db, tokenHash, quoteId })

    expect(result).toEqual({ redeemed: false, expired: false })
  })

  it('returns not expired when no matching row exists', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
    }

    const result = await dbRedeemQuoteAccessToken({ db, tokenHash, quoteId })

    expect(result).toEqual({ redeemed: false, expired: false })
  })
})
