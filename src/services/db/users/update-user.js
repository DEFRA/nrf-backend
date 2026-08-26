import { relationshipTypes } from '../../../common/constants/relationship-types.js'

/**
 * Updates a signed-in user's Defra ID profile on their existing users row, first merging
 * any existing email-only record (created when a quote was started before sign-in) so the
 * same person never ends up with two rows. Returns null if no row exists for this user yet
 * (neither by defra_id nor by a prior email-only record) — the caller should treat that as
 * not found rather than creating a new row. When an organisation is present and the
 * relationship type is not Citizen, upserts the organisation and user/organisation link — a
 * Citizen has no organisation to link, even if the token happened to carry an org id.
 * @param {Object} params
 * @param {import('pg').Pool} params.db - pg pool (request.pg)
 * @param {string} params.defraId - Defra ID sub claim (users.defra_id)
 * @param {string} params.email - email from the token
 * @param {string} params.firstName
 * @param {string} params.lastName
 * @param {string} [params.organisationDefraId] - Defra ID org id; when present (and relationshipType isn't Citizen) the organisation and link are upserted
 * @param {string} [params.organisationName] - required when organisationDefraId is present
 * @param {string} [params.relationshipType] - Citizen / Employee / Agent, stored on the link
 * @returns {Promise<{userId: string}|null>} The user id, or null if no matching row exists
 */
export const dbUpdateUser = async ({
  db,
  defraId,
  email,
  firstName,
  lastName,
  organisationDefraId,
  organisationName,
  relationshipType
}) => {
  // Merge a quote-created record (email only) into the Defra ID identity, if one exists.
  // The NOT EXISTS guard keeps this from clobbering a defra_id that is already on another row.
  await db.query(
    `UPDATE users SET defra_id = $1, first_name = $2, last_name = $3, updated_at = now(),
     first_signed_in_at = COALESCE(first_signed_in_at, now())
     WHERE email = $4 AND defra_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM users WHERE defra_id = $1)`,
    [defraId, firstName, lastName, email]
  )

  const {
    rows: [userRow]
  } = await db.query(
    `UPDATE users SET email = $2, first_name = $3, last_name = $4, updated_at = now(),
     first_signed_in_at = COALESCE(first_signed_in_at, now())
     WHERE defra_id = $1
     RETURNING id`,
    [defraId, email, firstName, lastName]
  )

  if (!userRow) {
    return null
  }

  if (organisationDefraId && relationshipType !== relationshipTypes.citizen) {
    await db.query(
      `INSERT INTO organisations (defra_id, name, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (defra_id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [organisationDefraId, organisationName]
    )

    await db.query(
      `INSERT INTO user_organisations (user_id, organisation_defra_id, relationship_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, organisation_defra_id) DO UPDATE SET relationship_type = EXCLUDED.relationship_type`,
      [userRow.id, organisationDefraId, relationshipType ?? null]
    )
  }

  return { userId: userRow.id }
}
