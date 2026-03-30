import { dbUpdateQuoteWithEmailSent } from './update-quote-with-email-sent.js'

describe('dbUpdateQuoteWithEmailSent', () => {
  it('should update email_send_request_at for the given reference', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateQuoteWithEmailSent({
      db,
      reference: 'NRF-000001',
      data: { emailSendRequestAt: '2026-03-23T00:00:00.000Z' }
    })

    expect(db.query).toHaveBeenCalledWith(
      'UPDATE quotes SET email_send_request_at = $1 WHERE reference = $2',
      ['2026-03-23T00:00:00.000Z', 'NRF-000001']
    )
  })

  it('should not return a value', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    const result = await dbUpdateQuoteWithEmailSent({
      db,
      reference: 'NRF-000001',
      data: { emailSendRequestAt: '2026-03-23T00:00:00.000Z' }
    })

    expect(result).toBeUndefined()
  })
})
