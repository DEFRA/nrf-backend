import { withTransaction } from './with-transaction.js'

describe('withTransaction', () => {
  let client
  let pool

  beforeEach(() => {
    client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() }
    pool = { connect: vi.fn().mockResolvedValue(client) }
  })

  it('commits and returns the callback result', async () => {
    const result = await withTransaction(pool, async (db) => {
      await db.query('SELECT 1')
      return 'done'
    })

    expect(result).toBe('done')
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN')
    expect(client.query).toHaveBeenLastCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back and rethrows when the callback throws', async () => {
    const boom = new Error('nope')

    await expect(
      withTransaction(pool, async () => {
        throw boom
      })
    ).rejects.toThrow(boom)

    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.query).not.toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('releases the client even when the rollback itself fails', async () => {
    client.query.mockImplementation((sql) =>
      sql === 'ROLLBACK'
        ? Promise.reject(new Error('connection lost'))
        : Promise.resolve({})
    )

    await expect(
      withTransaction(pool, async () => {
        throw new Error('nope')
      })
    ).rejects.toThrow('nope')

    expect(client.release).toHaveBeenCalled()
  })
})
