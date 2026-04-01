import { getCurrentISODateTime } from '../../../common/helpers/date-time.js'

export const dbCreateQuote = async ({ db, quoteData }) => {
  const {
    boundaryEntryType,
    boundaryGeojson,
    developmentTypes,
    residentialBuildingCount,
    peopleCount,
    wasteWaterTreatmentWorks,
    email
  } = quoteData
  const createdAt = getCurrentISODateTime()
  const crsWgs84 = 4326
  const { boundaryGeometryOriginal } = boundaryGeojson
  const crsFromGeometry =
    boundaryGeometryOriginal.crs?.properties?.name.split('::')?.[1]
  const crs = crsFromGeometry ? Number.parseInt(crsFromGeometry, 10) : crsWgs84
  const { rows } = await db.query(
    `INSERT INTO quotes (email_address, boundary_entry_type, boundary_geodata, development_types, residential_building_count, people_count, waste_water_treatment_works, created_at)
     VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), $4), $5, $6, $7, $8, $9)
     RETURNING id, reference`,
    [
      email,
      boundaryEntryType,
      JSON.stringify(boundaryGeometryOriginal),
      crs,
      developmentTypes,
      residentialBuildingCount ?? null,
      peopleCount ?? null,
      wasteWaterTreatmentWorks ?? null,
      createdAt
    ]
  )
  return rows[0]
}
