import { getCurrentISODateTime } from '../../../common/helpers/date-time.js'
import { dbSavePlaceholderEdpResults } from '../quote_edp_results/queries.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'

const logger = createLogger()

export const dbCreateQuote = async ({ db, quoteData }) => {
  const {
    planningType,
    boundaryEntryType,
    boundaryGeojson,
    boundaryFilename,
    housingUnits,
    email,
    disableAnalyticsAudit
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
    `INSERT INTO quotes (user_id, planning_type, boundary_entry_type, boundary_geodata, boundary_filename, residential_building_count, disable_analytics_audit, created_at)
     VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), $5), $6, $7, $8, $9)
     RETURNING id, reference`,
    [
      userId,
      planningType,
      boundaryEntryType,
      JSON.stringify(boundaryGeometryOriginal),
      crs,
      boundaryFilename ?? null,
      housingUnits,
      disableAnalyticsAudit ?? false,
      createdAt
    ]
  )
  const quote = rows[0]

  // A label-less EDP cannot be stored or matched: the callback finds a
  // placeholder by name, and edp_name is NOT NULL.
  const reportedEdps = boundaryGeojson.intersectingEdps ?? []
  const labelledEdps = reportedEdps.filter((edp) => edp.label)
  if (labelledEdps.length < reportedEdps.length) {
    logger.info(
      { quoteId: quote.id, skipped: reportedEdps.length - labelledEdps.length },
      'Skipping intersecting EDPs with no label'
    )
  }

  // The callback still creates a proper row if this fails, so a placeholder
  // insert must never fail quote creation.
  try {
    await dbSavePlaceholderEdpResults({
      db,
      quoteId: quote.id,
      intersectingEdps: labelledEdps
    })
  } catch (error) {
    logger.error(
      error,
      `Failed to save placeholder EDP results - quoteId: ${quote.id}`
    )
  }

  return { ...quote, userId, userCreated }
}
