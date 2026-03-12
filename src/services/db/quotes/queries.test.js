import { dbCreateQuote, dbGetQuote } from './queries.js'

describe('dbCreateQuote', () => {
  const mockRow = { id: 1, reference: 'NRF-000001' }

  it('should insert a new quote with all fields and return it', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    const result = await dbCreateQuote({
      db,
      quoteData: {
        email: 'developer@housebuilder.com',
        boundaryEntryType: 'draw',
        developmentTypes: ['housing'],
        residentialBuildingCount: 10,
        peopleCount: undefined
      }
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quotes'),
      ['developer@housebuilder.com', 'draw', ['housing'], 10, null]
    )
    expect(result).toEqual(mockRow)
  })

  it('should pass null for optional fields when not provided', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    await dbCreateQuote({
      db,
      quoteData: {
        email: 'developer@housebuilder.com',
        boundaryEntryType: 'upload',
        developmentTypes: ['other-residential'],
        peopleCount: 5
      }
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quotes'),
      ['developer@housebuilder.com', 'upload', ['other-residential'], null, 5]
    )
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
