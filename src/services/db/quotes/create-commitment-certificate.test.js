import { dbCreateCommitmentCertificate } from './create-commitment-certificate.js'

describe('dbCreateCommitmentCertificate', () => {
  const reference = 'NRL-000001'

  it('only stamps a quote that has no commitment certificate time yet', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{}] }) }

    await dbCreateCommitmentCertificate({ db, reference })

    const [sql, params] = db.query.mock.calls[0]
    const normalised = sql.replace(/\s+/g, ' ')
    expect(normalised).toContain('UPDATE quotes')
    expect(normalised).toContain(
      'SET commitment_certificate_created_at = now()'
    )
    expect(normalised).toContain(
      'AND commitment_certificate_created_at IS NULL'
    )
    expect(params).toEqual([reference])
  })

  it.each([
    ['a row was updated', [{}], true],
    ['no row was updated', [], false]
  ])(
    'returns whether it recorded the time when %s',
    async (_d, rows, expected) => {
      const db = { query: vi.fn().mockResolvedValue({ rows }) }

      const result = await dbCreateCommitmentCertificate({ db, reference })

      expect(result).toBe(expected)
    }
  )
})
