/**
 * Fetches a user by Defra ID, along with each organisation they are linked to and the
 * relationship type on that link.
 * @param {Object} params
 * @param {import('pg').Pool} params.db - pg pool (request.pg)
 * @param {string} params.defraId - Defra ID sub claim (users.defra_id)
 * @returns {Promise<{id: string, defraId: string, email: string, firstName: string|null, lastName: string|null, createdAt: Date, updatedAt: Date|null, firstSignedInAt: Date|null, organisations: Array<{defraId: string, name: string, relationshipType: string|null}>} | null>}
 */
export const dbGetUser = async ({ db, defraId }) => {
  const { rows } = await db.query(
    `SELECT u.id, u.defra_id, u.email, u.first_name, u.last_name,
            u.created_at, u.updated_at, u.first_signed_in_at,
            o.defra_id AS organisation_defra_id, o.name AS organisation_name,
            uo.relationship_type
       FROM users u
  LEFT JOIN user_organisations uo ON uo.user_id = u.id
  LEFT JOIN organisations o ON o.defra_id = uo.organisation_defra_id
      WHERE u.defra_id = $1
   ORDER BY o.defra_id`,
    [defraId]
  )

  if (!rows.length) {
    return null
  }

  const row = rows[0]
  const organisations = rows
    .filter((r) => r.organisation_defra_id !== null)
    .map((r) => ({
      defraId: r.organisation_defra_id,
      name: r.organisation_name,
      relationshipType: r.relationship_type ?? null
    }))

  return {
    id: row.id,
    defraId: row.defra_id,
    email: row.email,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    firstSignedInAt: row.first_signed_in_at ?? null,
    organisations
  }
}
