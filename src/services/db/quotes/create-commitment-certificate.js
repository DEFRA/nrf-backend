import { dbSaveLevyCalculation } from '../quote_edp_results/queries.js'
import { JOURNEY_REQUEST_TO_USE } from '../../../common/constants/journey.js'

export const COMMITMENT_CERTIFICATE_CREATED = 'created'
export const COMMITMENT_CERTIFICATE_UNAVAILABLE = 'unavailable'
export const COMMITMENT_CERTIFICATE_NO_RESULTS = 'no_results'

/**
 * Atomically records that the commitment certificate has been created, and the
 * levy calculation the user committed to as a new row in the quote's history.
 * The commitment_certificate_created_at IS NULL guard means only the first of
 * any concurrent calls succeeds, and the original timestamp is never
 * overwritten. The certificate and the history row are written together or
 * not at all.
 *
 * @param {object} params
 * @param {{ connect: Function }} params.db the connection pool
 * @param {string} params.reference
 * @param {Parameters<typeof dbSaveLevyCalculation>[0]['levy']} params.levy the levy calculation the user accepted
 * @returns {Promise<'created' | 'unavailable' | 'no_results'>} `unavailable` when the quote is unknown or already has a certificate; `no_results` when the quote has no levy results to snapshot
 */
export const dbCreateCommitmentCertificate = async ({
  db,
  reference,
  levy
}) => {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE quotes
       SET commitment_certificate_created_at = now()
       WHERE reference = $1
         AND commitment_certificate_created_at IS NULL
       RETURNING id`,
      [reference]
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return COMMITMENT_CERTIFICATE_UNAVAILABLE
    }

    const inserted = await dbSaveLevyCalculation({
      db: client,
      quoteId: rows[0].id,
      journey: JOURNEY_REQUEST_TO_USE,
      levy
    })
    if (inserted === 0) {
      await client.query('ROLLBACK')
      return COMMITMENT_CERTIFICATE_NO_RESULTS
    }

    await client.query('COMMIT')
    return COMMITMENT_CERTIFICATE_CREATED
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
