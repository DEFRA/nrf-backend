/**
 * Atomically records that the commitment certificate has been created. The
 * commitment_certificate_created_at IS NULL guard means only the first of any
 * concurrent calls succeeds, and the original timestamp is never overwritten.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {string} params.reference
 * @returns {Promise<boolean>} true if this call recorded the creation
 */
export const dbCreateCommitmentCertificate = async ({ db, reference }) => {
  const { rows } = await db.query(
    `UPDATE quotes
     SET commitment_certificate_created_at = now()
     WHERE reference = $1
       AND commitment_certificate_created_at IS NULL
     RETURNING id`,
    [reference]
  )
  return rows.length > 0
}
