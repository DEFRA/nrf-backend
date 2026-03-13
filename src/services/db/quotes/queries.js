export const dbCreateQuote = async ({ db, quoteData }) => {
  const {
    boundaryEntryType,
    developmentTypes,
    residentialBuildingCount,
    peopleCount,
    email
  } = quoteData
  const { rows } = await db.query(
    `INSERT INTO quotes (email_address, boundary_entry_type, development_types, residential_building_count, people_count)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, reference`,
    [
      email,
      boundaryEntryType,
      developmentTypes,
      residentialBuildingCount ?? null,
      peopleCount ?? null
    ]
  )
  return rows[0]
}

export const dbGetQuote = async ({ db, reference }) => {
  const { rows } = await db.query(
    'SELECT id, reference FROM quotes WHERE reference = $1',
    [reference]
  )
  return rows[0] ?? null
}
