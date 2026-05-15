export const QUOTE_SELECT_SQL = `SELECT q.id, q.reference, q.email_address, q.email_send_request_at, q.boundary_entry_type, q.boundary_filename, q.development_types, q.residential_building_count, q.people_count, q.waste_water_treatment_works_id, q.waste_water_treatment_works_name, q.created_at, ST_AsGeoJSON(ST_Transform(q.boundary_geodata, 4326)) AS boundary_geodata,
        e.edp_id, e.edp_name, e.edp_type, e.impact, e.levy_gbp_min, e.levy_gbp_max
 FROM quotes q
 LEFT JOIN quote_edp_results e ON e.quote_id = q.id`

/**
 * @param {object[]} rows - Raw database rows for a single quote (all sharing the same quote id)
 * @returns {{ id: string, reference: string, createdAt: Date, development: { types: string[], residentialBuildingCount: number, peopleCount: number }, boundary: { geoJsonWgs84: string, userInputType: string, filename: string }, wasteWaterTreatmentWorksId: string, wasteWaterTreatmentWorksName: string, email: { address: string, sendRequestAt: Date }, edps: Array<{ edpId: string, edpName: string, edpType: string, impact: object, levyGbp: { min: number, max: number } }> } | null}
 */
export const mapQuoteRows = (rows) => {
  if (!rows.length) return null

  const row = rows[0]
  return {
    id: row.id,
    reference: row.reference,
    createdAt: row.created_at,
    development: {
      types: row.development_types,
      residentialBuildingCount: row.residential_building_count,
      peopleCount: row.people_count
    },
    boundary: {
      geoJsonWgs84: row.boundary_geodata,
      userInputType: row.boundary_entry_type,
      filename: row.boundary_filename
    },
    wasteWaterTreatmentWorksId: row.waste_water_treatment_works_id,
    wasteWaterTreatmentWorksName: row.waste_water_treatment_works_name,
    email: {
      address: row.email_address,
      sendRequestAt: row.email_send_request_at
    },
    edps: rows
      .filter((r) => r.edp_id !== null)
      .map((r) => ({
        edpId: r.edp_id,
        edpName: r.edp_name,
        edpType: r.edp_type,
        impact: r.impact,
        levyGbp: {
          min: r.levy_gbp_min,
          max: r.levy_gbp_max
        }
      }))
  }
}
