import { getLevyAmount } from '../../../api/quote/helpers/get-levy-amount.js'
import { buildNotifyStatusUrl } from '../../../common/helpers/notify-status-url.js'

// ST_Transform looks up the geometry's SRID in spatial_ref_sys and throws if
// it's not a recognised one — since ST_SetSRID (used on insert) never
// validates the SRID it's given, a single row with a bad/legacy SRID would
// otherwise fail this query for every quote, not just that row.
export const QUOTE_SELECT_SQL = `SELECT q.id, q.reference, q.user_id, q.planning_type, q.boundary_entry_type, q.boundary_filename, q.residential_building_count, q.disable_analytics_audit, q.created_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM spatial_ref_sys WHERE srid = ST_SRID(q.boundary_geodata))
          THEN ST_AsGeoJSON(ST_Transform(q.boundary_geodata, 4326))
          ELSE NULL
        END AS boundary_geodata,
        u.email AS email_address,
        en.notify_send_status, en.email_notification_id, en.email_requested_at, en.email_type, en.retry_count,
        (SELECT COALESCE(
          json_agg(
            json_build_object(
              'emailType', qen.email_type,
              'notifySendStatus', qen.notify_send_status,
              'sendRetryCount', qen.retry_count,
              'sendRequestAt', qen.created_at,
              'notificationId', qen.notification_id::text
            )
            ORDER BY qen.created_at ASC
          ),
          '[]'::json
        )
        FROM quote_email_notifications qen
        WHERE qen.quote_id = q.id) AS email_notifications,
        e.edp_id, e.edp_name, e.edp_type, e.impact, e.catchments, e.levy_excluding_vat, e.levy_base_amount, e.levy_inflation_adjusted, e.levy_model_version
 FROM quotes q
 LEFT JOIN users u ON u.id = q.user_id
 LEFT JOIN quote_edp_results e ON e.quote_id = q.id
 LEFT JOIN LATERAL (
   SELECT notify_send_status, notification_id AS email_notification_id, created_at AS email_requested_at, email_type, retry_count
     FROM quote_email_notifications
    WHERE quote_id = q.id
    ORDER BY created_at DESC
    LIMIT 1
 ) en ON true`

/**
 * @param {object[]} rows - Raw database rows for a single quote (all sharing the same quote id)
 * @returns {{ id: string, reference: string, userId: string, createdAt: Date, housingUnits: number, boundary: { geoJsonWgs84: string, userInputType: string, filename: string }, email: { address: string, sendRequestAt: Date }, edps: Array<{ edpId: string, edpName: string, edpType: string, impact: object, catchments: Array<{ label: string, catchmentId: string | null, catchmentOverlapPercentage: number }> | null, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } }>, levyGbp: { levyAmountExcludingVat: number, levyAmountInflationAdjusted: number } | null } | null}
 */
export const mapQuoteRows = (rows) => {
  if (!rows.length) {
    return null
  }

  const row = rows[0]
  const edps = rows
    .filter((r) => r.edp_id !== null)
    .map((r) => ({
      edpId: r.edp_id,
      edpName: r.edp_name,
      edpType: r.edp_type,
      impact: r.impact,
      catchments: r.catchments ?? null,
      levyGbp: {
        amountExcludingVat: r.levy_excluding_vat,
        amountInflationAdjusted: r.levy_inflation_adjusted,
        baseAmount: r.levy_base_amount,
        modelVersion: r.levy_model_version
      }
    }))

  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    createdAt: row.created_at,
    planningType: row.planning_type,
    housingUnits: row.residential_building_count,
    boundary: {
      geoJsonWgs84: row.boundary_geodata,
      userInputType: row.boundary_entry_type,
      filename: row.boundary_filename
    },
    email: {
      address: row.email_address,
      sendRequestAt: row.email_requested_at ?? null,
      notifySendStatus: row.notify_send_status ?? null,
      emailType: row.email_type ?? null,
      sendRetryCount: row.retry_count ?? null,
      notifyStatusUrl: row.email_notification_id
        ? buildNotifyStatusUrl(row.email_notification_id)
        : null
    },
    emailNotifications: (row.email_notifications ?? []).map((n) => ({
      emailType: n.emailType,
      notifySendStatus: n.notifySendStatus,
      sendRetryCount: n.sendRetryCount,
      sendRequestAt: n.sendRequestAt,
      notificationId: n.notificationId ?? null,
      notifyStatusUrl: n.notificationId
        ? buildNotifyStatusUrl(n.notificationId)
        : null
    })),
    disableAnalyticsAudit: row.disable_analytics_audit ?? false,
    edps,
    levyGbp: edps.length ? getLevyAmount(edps) : null
  }
}
