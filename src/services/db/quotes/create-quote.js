import { getCurrentISODateTime } from '../../../common/helpers/date-time.js'

export const dbCreateQuote = async ({ db, quoteData }) => {
  const {
    planningType,
    boundaryEntryType,
    boundaryGeojson,
    boundaryFilename,
    developmentTypes,
    residentialBuildingCount,
    peopleCount,
    email
  } = quoteData

  const { rows: userRows } = await db.query(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, (xmax = 0) AS created`,
    [email]
  )
  const { id: userId, created: userCreated } = userRows[0]

  const createdAt = getCurrentISODateTime()
  const crsWgs84 = 4326
  const { boundaryGeometryOriginal } = boundaryGeojson
  const crsFromGeometry =
    boundaryGeometryOriginal.crs?.properties?.name.split('::')?.[1]
  const crs = crsFromGeometry ? Number.parseInt(crsFromGeometry, 10) : crsWgs84
  const { rows } = await db.query(
    `INSERT INTO quotes (user_id, planning_type, boundary_entry_type, boundary_geodata, boundary_filename, development_types, residential_building_count, people_count, created_at)
     VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), $5), $6, $7, $8, $9, $10)
     RETURNING id, reference`,
    [
      userId,
      planningType,
      boundaryEntryType,
      JSON.stringify(boundaryGeometryOriginal),
      crs,
      boundaryFilename ?? null,
      developmentTypes,
      residentialBuildingCount ?? null,
      peopleCount ?? null,
      createdAt
    ]
  )
  return { ...rows[0], userId, userCreated }
}
