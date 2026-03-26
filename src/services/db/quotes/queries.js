import { getCurrentISODateTime } from '../../../common/helpers/date-time.js'

export const dbCreateQuote = async ({ db, quoteData }) => {
  const {
    boundaryEntryType,
    boundaryGeojson,
    developmentTypes,
    residentialBuildingCount,
    peopleCount,
    email
  } = quoteData
  const createdAt = getCurrentISODateTime()
  const { boundaryGeometryOriginal, intersectingEdps } = boundaryGeojson
  const crsFromGeometry =
    boundaryGeometryOriginal.crs?.properties?.name.split('::')?.[1]
  const crs = Number.parseInt(crsFromGeometry, 10) || 4326
  const { rows } = await db.query(
    `INSERT INTO quotes (email_address, boundary_entry_type, boundary_geodata, boundary_edp_intersections, development_types, residential_building_count, people_count, created_at)
     VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), $4), $5, $6, $7, $8, $9)
     RETURNING id, reference`,
    [
      email,
      boundaryEntryType,
      JSON.stringify(boundaryGeometryOriginal),
      crs,
      JSON.stringify(intersectingEdps),
      developmentTypes,
      residentialBuildingCount ?? null,
      peopleCount ?? null,
      createdAt
    ]
  )
  return rows[0]
}

export const dbUpdateQuoteWithEmailSent = async ({ db, reference, data }) => {
  const { emailSendRequestAt } = data
  await db.query(
    'UPDATE quotes SET email_send_request_at = $1 WHERE reference = $2',
    [emailSendRequestAt, reference]
  )
}

export const dbGetQuote = async ({ db, reference }) => {
  const { rows } = await db.query(
    'SELECT *, ST_AsGeoJSON (ST_Transform(boundary_geodata, 4326)) AS boundary_geodata FROM quotes WHERE reference = $1',
    [reference]
  )
  return rows[0] ?? null
}
