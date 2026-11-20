/**
 * Runs `work` in a transaction that holds a lock on the quote, so concurrent
 * callers for the same quote run one after another. A duplicate estimate
 * callback then sees the first caller's rows and writes nothing, and only the
 * first issues the email.
 *
 * The lock is keyed on the quote id and released when the transaction ends.
 *
 * @template T
 * @param {object} params
 * @param {{ connect: Function }} params.db the connection pool
 * @param {number} params.quoteId
 * @param {(client: { query: Function }) => Promise<T>} params.work
 * @returns {Promise<T>} what `work` returns
 */
export const withQuoteLock = async ({ db, quoteId, work }) => {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [quoteId])
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
