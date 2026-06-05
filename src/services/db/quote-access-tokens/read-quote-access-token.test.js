import { dbReadQuoteAccessToken } from './read-quote-access-token.js'

describe('dbReadQuoteAccessToken', () => {
  const tokenHash = 'abc123hash'
  const quoteId = 42

  it('queries by token hash and quote id without mutating', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ live: true, time_expired: false }] })
    }

    await dbReadQuoteAccessToken({ db, tokenHash, quoteId })

    const [sql, params] = db.query.mock.calls[0]
    const normalised = sql.replace(/\s+/g, ' ')
    expect(normalised).toContain('SELECT')
    expect(normalised).not.toContain('UPDATE')
    expect(normalised).toContain('expires_at > now()')
    expect(normalised).toContain('session_count < max_sessions')
    expect(normalised).toContain('expires_at <= now()')
    expect(params).toEqual([tokenHash, quoteId])
  })

  it('returns valid for a live token', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ live: true, time_expired: false }] })
    }

    const result = await dbReadQuoteAccessToken({ db, tokenHash, quoteId })

    expect(result).toEqual({ valid: true, expired: false, timeExpired: false })
  })

  it('returns time-expired when the token is past its expiry time', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ live: false, time_expired: true }] })
    }

    const result = await dbReadQuoteAccessToken({ db, tokenHash, quoteId })

    expect(result).toEqual({ valid: false, expired: true, timeExpired: true })
  })

  it('returns expired but not time-expired for a session-exhausted token', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ live: false, time_expired: false }] })
    }

    const result = await dbReadQuoteAccessToken({ db, tokenHash, quoteId })

    expect(result).toEqual({ valid: false, expired: true, timeExpired: false })
  })

  it('returns neither valid nor expired when no row matches', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    const result = await dbReadQuoteAccessToken({ db, tokenHash, quoteId })

    expect(result).toEqual({ valid: false, expired: false, timeExpired: false })
  })
})
