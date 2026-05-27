import { getCurrentISODateTime } from '../../../common/helpers/date-time.js'

export const dbCreateQuote = async ({ db, quoteData }) => {
  const {
    boundaryEntryType,
    boundaryGeojson,
    boundaryFilename,
    developmentTypes,
    residentialBuildingCount,
    peopleCount,
    wasteWaterTreatmentWorksId,
    wasteWaterTreatmentWorksName,
    email
  } = quoteData

  const { rows: userRows } = await db.query(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email]
  )
  const userId = userRows[0].id

  const createdAt = getCurrentISODateTime()
  const crsWgs84 = 4326
  const { boundaryGeometryOriginal } = boundaryGeojson
  const crsFromGeometry =
    boundaryGeometryOriginal.crs?.properties?.name.split('::')?.[1]
  const crs = crsFromGeometry ? Number.parseInt(crsFromGeometry, 10) : crsWgs84
  const { rows } = await db.query(
    `INSERT INTO quotes (user_id, boundary_entry_type, boundary_geodata, boundary_filename, development_types, residential_building_count, people_count, waste_water_treatment_works_id, waste_water_treatment_works_name, created_at)
     VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), $4), $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, reference`,
    [
      userId,
      boundaryEntryType,
      JSON.stringify(boundaryGeometryOriginal),
      crs,
      boundaryFilename ?? null,
      developmentTypes,
      residentialBuildingCount ?? null,
      peopleCount ?? null,
      wasteWaterTreatmentWorksId ?? null,
      wasteWaterTreatmentWorksName ?? null,
      createdAt
    ]
  )
  return rows[0]
}
