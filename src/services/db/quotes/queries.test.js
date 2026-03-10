import { dbCreateQuote, dbGetQuote } from './queries.js'

describe('dbCreateQuote', () => {
  it('should insert a new quote and return it', async () => {
    const mockRow = { id: 1, reference: 'NRF-000001' }
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    const result = await dbCreateQuote({
      db,
      emailAddress: 'developer@housebuilder.com'
    })

    expect(db.query).toHaveBeenCalledWith(
      'INSERT INTO quotes (email_address) VALUES ($1) RETURNING id, reference',
      ['developer@housebuilder.com']
    )
    expect(result).toEqual(mockRow)
  })
})

describe('dbGetQuote', () => {
  it('should return the quote when found', async () => {
    const mockRow = { id: 1, reference: 'NRF-000001' }
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    const result = await dbGetQuote({ db, reference: 'NRF-000001' })

    expect(db.query).toHaveBeenCalledWith(
      'SELECT id, reference FROM quotes WHERE reference = $1',
      ['NRF-000001']
    )
    expect(result).toEqual(mockRow)
  })

  it('should return null when the quote is not found', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    const result = await dbGetQuote({ db, reference: 'NRF-000001' })

    expect(result).toBeNull()
  })
})
