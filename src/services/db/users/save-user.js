/**
 * Saves a signed-in user's Defra ID profile. Upserts the user by defra_id, first
 * merging any existing email-only record (created when a quote was started before
 * sign-in) so the same person never ends up with two rows. When an organisation is
 * present, upserts it and the user/organisation link with its relationship type.
 * @param {Object} params
 * @param {import('pg').Pool} params.db - pg pool (request.pg)
 * @param {string} params.defraId - Defra ID sub claim (users.defra_id)
 * @param {string} params.email - email from the token
 * @param {string} params.firstName
 * @param {string} params.lastName
 * @param {string} [params.organisationDefraId] - Defra ID org id; when present the organisation and link are upserted
 * @param {string} [params.organisationName] - required when organisationDefraId is present
 * @param {string} [params.relationshipType] - Citizen / Employee / Agent, stored on the link
 * @returns {Promise<{userId: string, userCreated: boolean}>} The user id and whether a new row was inserted
 */
export const dbSaveUser = async ({
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
    `INSERT INTO users (defra_id, email, first_name, last_name, updated_at, first_signed_in_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (defra_id) DO UPDATE SET
       email = EXCLUDED.email,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       updated_at = now(),
       first_signed_in_at = COALESCE(users.first_signed_in_at, EXCLUDED.first_signed_in_at)
     RETURNING id, (xmax = 0) AS created`,
    [defraId, email, firstName, lastName]
  )

  if (organisationDefraId) {
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

  return { userId: userRow.id, userCreated: userRow.created }
}
