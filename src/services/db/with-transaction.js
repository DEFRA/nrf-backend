import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Runs `fn` inside a transaction on a client checked out of the pool. The
 * client is released even when the rollback itself fails, so a failed
 * transaction cannot leak a pool connection.
 *
 * @param {{ connect: Function }} pool
 * @param {(client: { query: Function }) => Promise<any>} fn
 * @returns {Promise<any>} whatever `fn` resolves to
 */
export const withTransaction = async (pool, fn) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      logger.error(rollbackError, 'Failed to roll back transaction')
    })
    throw error
  } finally {
    client.release()
  }
}
