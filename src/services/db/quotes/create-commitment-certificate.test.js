import {
  dbCreateCommitmentCertificate,
  COMMITMENT_CERTIFICATE_CREATED,
  COMMITMENT_CERTIFICATE_UNAVAILABLE,
  COMMITMENT_CERTIFICATE_NO_RESULTS
} from './create-commitment-certificate.js'
import { commitmentLevy } from '../../../test-utils/fixtures/quotePayloads.js'

describe('dbCreateCommitmentCertificate', () => {
  const reference = 'NRL-000001'

  const setup = ({ stampRows, insertedRows }) => {
    const client = {
      query: vi.fn().mockImplementation(async (sql) => {
        if (sql.includes('UPDATE quotes')) {
          return { rows: stampRows }
        }
        if (sql.includes('INSERT INTO quote_edp_results')) {
          return { rowCount: insertedRows }
        }
        return { rows: [] }
      }),
      release: vi.fn()
    }
    return { client, db: { connect: vi.fn().mockResolvedValue(client) } }
  }

  const statements = (client) =>
    client.query.mock.calls.map(([sql]) => sql.replace(/\s+/g, ' ').trim())

  it('only stamps a quote that has no commitment certificate time yet', async () => {
    const { client, db } = setup({ stampRows: [{ id: 7 }], insertedRows: 1 })

    await dbCreateCommitmentCertificate({ db, reference, levy: commitmentLevy })

    const [sql, params] = client.query.mock.calls[1]
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

  it('stamps the quote and adds the history row in one committed transaction', async () => {
    const { client, db } = setup({ stampRows: [{ id: 7 }], insertedRows: 1 })

    const result = await dbCreateCommitmentCertificate({
      db,
      reference,
      levy: commitmentLevy
    })

    expect(result).toBe(COMMITMENT_CERTIFICATE_CREATED)
    expect(statements(client)).toEqual([
      'BEGIN',
      expect.stringContaining('UPDATE quotes'),
      expect.stringContaining('INSERT INTO quote_edp_results'),
      'COMMIT'
    ])
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back and writes no history when no quote was stamped', async () => {
    const { client, db } = setup({ stampRows: [], insertedRows: 1 })

    const result = await dbCreateCommitmentCertificate({
      db,
      reference,
      levy: commitmentLevy
    })

    expect(result).toBe(COMMITMENT_CERTIFICATE_UNAVAILABLE)
    expect(statements(client)).toEqual([
      'BEGIN',
      expect.stringContaining('UPDATE quotes'),
      'ROLLBACK'
    ])
  })

  it('rolls back the stamp when the quote has no results to copy', async () => {
    const { client, db } = setup({ stampRows: [{ id: 7 }], insertedRows: 0 })

    const result = await dbCreateCommitmentCertificate({
      db,
      reference,
      levy: commitmentLevy
    })

    expect(result).toBe(COMMITMENT_CERTIFICATE_NO_RESULTS)
    expect(statements(client).at(-1)).toBe('ROLLBACK')
  })

  it('rolls back and rethrows when a statement fails', async () => {
    const { client, db } = setup({ stampRows: [{ id: 7 }], insertedRows: 1 })
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('UPDATE quotes')) {
        throw new Error('database is down')
      }
      return { rows: [] }
    })

    await expect(
      dbCreateCommitmentCertificate({ db, reference, levy: commitmentLevy })
    ).rejects.toThrow('database is down')

    expect(statements(client).at(-1)).toBe('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})
