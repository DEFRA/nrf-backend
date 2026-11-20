import { getLevyAmount } from '../../../api/quote/helpers/get-levy-amount.js'
import { buildNotifyStatusUrl } from '../../../common/helpers/notify-status-url.js'
import { QUOTE_EMAIL_TYPES } from '../../../common/constants/email-type.js'

// QUOTE_SELECT_SQL is a bare fragment that callers extend with their own
// placeholders, so the type list cannot be bound as a parameter here. These are
// hardcoded constants in our own code (not user input), so inlining them as SQL
// literals is safe — the same approach the Notify status lists use.
const quoteEmailTypeLiterals = QUOTE_EMAIL_TYPES.map(
  (emailType) => `'${emailType}'`
).join(', ')

// ST_Transform looks up the geometry's SRID in spatial_ref_sys and throws if
// it's not a recognised one — since ST_SetSRID (used on insert) never
// validates the SRID it's given, a single row with a bad/legacy SRID would
// otherwise fail this query for every quote, not just that row.
export const QUOTE_SELECT_SQL = `SELECT q.id, q.reference, q.user_id, q.planning_type, q.boundary_entry_type, q.boundary_filename, q.residential_building_count, q.disable_analytics_audit, q.created_at, q.commitment_certificate_created_at,
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
        e.edp_id, e.edp_name, e.impact, e.catchments, e.levy_provisional_amount, e.levy_inflation_adjusted, e.levy_model_version,
        e.levy_calculated_at, e.levy_base_charge_per_unit, e.levy_units, e.edp_start_date::text AS edp_start_date, e.levy_original_base_amount, e.levy_original_base_charge_per_unit, e.journey, e.created_at AS levy_created_at,
        (SELECT COALESCE(
          json_agg(
            json_build_object(
              'journey', h.journey,
              'createdAt', h.created_at,
              'calculatedAt', h.levy_calculated_at,
              'provisionalAmount', h.levy_provisional_amount::text,
              'inflationAdjustedAmount', h.levy_inflation_adjusted::text,
              'baseChargePerUnit', h.levy_base_charge_per_unit::text,
              'units', h.levy_units,
              'modelVersion', h.levy_model_version,
              'originalBaseAmount', h.levy_original_base_amount::text,
              'originalBaseChargePerUnit', h.levy_original_base_charge_per_unit::text
            )
            ORDER BY h.created_at DESC, h.id DESC
          ),
          '[]'::json
        )
        FROM quote_edp_results h
        WHERE h.quote_id = q.id AND h.edp_id = e.edp_id AND h.id <> e.id) AS levy_history
 FROM quotes q
 LEFT JOIN users u ON u.id = q.user_id
 LEFT JOIN LATERAL (
   SELECT DISTINCT ON (edp_id) *
     FROM quote_edp_results
    WHERE quote_id = q.id
    ORDER BY edp_id, created_at DESC, id DESC
 ) e ON true
 LEFT JOIN LATERAL (
   SELECT notify_send_status, notification_id AS email_notification_id, created_at AS email_requested_at, email_type, retry_count
     FROM quote_email_notifications
    WHERE quote_id = q.id
      AND email_type IN (${quoteEmailTypeLiterals})
    ORDER BY created_at DESC
    LIMIT 1
 ) en ON true`

/**
 * @typedef {object} MappedEdpLevyGbp
 * @property {string} amountExcludingVat - NUMERIC(12,2); node-postgres returns NUMERIC as string (no custom type parser)
 * @property {string} amountInflationAdjusted - NUMERIC(12,2); same
 * @property {string} baseAmount - NUMERIC(12,2); same
 * @property {number} modelVersion
 * @property {string} journey - 'quote' or 'request_to_use': the journey the calculation was made in
 * @property {Date} createdAt - when this calculation was recorded
 * @property {Date} calculatedAt - when the levy was calculated
 * @property {string} originalBaseAmount - NUMERIC(12,2) as string
 * @property {string} baseChargePerUnit - NUMERIC(12,2) as string
 * @property {string} originalBaseChargePerUnit - NUMERIC(12,2) as string
 * @property {number} units
 */

/**
 * @typedef {object} MappedPreviousLevyCalculation
 * @property {string} journey
 * @property {string} createdAt
 * @property {string} calculatedAt
 * @property {string} provisionalAmount
 * @property {string} inflationAdjustedAmount
 * @property {string} originalBaseAmount
 * @property {string} baseChargePerUnit
 * @property {string} originalBaseChargePerUnit
 * @property {number} units
 * @property {number} modelVersion
 */

/**
 * @typedef {object} MappedEdp
 * @property {number} edpId
 * @property {string} edpName
 * @property {string} edpStartDate
 * @property {object} impact - raw JSONB from quote_edp_results.impact
 * @property {Array<{label: string, catchmentId: string|null, catchmentOverlapPercentage: number}>|null} catchments
 * @property {MappedEdpLevyGbp} levyGbp - the EDP's current (latest) calculation
 * @property {MappedPreviousLevyCalculation[]} previousLevyCalculations - the EDP's earlier calculations, newest first
 */

/**
 * @typedef {object} MappedEmail
 * @property {string} address
 * @property {Date|null} sendRequestAt
 * @property {string|null} notifySendStatus
 * @property {string|null} emailType
 * @property {number|null} sendRetryCount
 * @property {string|null} notifyStatusUrl
 */

/**
 * @typedef {object} MappedQuote
 * @property {number} id
 * @property {string} reference
 * @property {string|null} userId
 * @property {Date} createdAt
 * @property {Date|null} commitmentCertificateCreatedAt
 * @property {string|null} planningType
 * @property {number|null} housingUnits - maps quotes.residential_building_count
 * @property {{ geoJsonWgs84: string|null, userInputType: string, filename: string|null }} boundary
 * @property {MappedEmail} email - the quote's headline email status: the latest email of a type in QUOTE_EMAIL_TYPES, so another kind of email cannot displace it
 * @property {object[]} emailNotifications - every email sent for the quote, whatever its type
 * @property {boolean} disableAnalyticsAudit
 * @property {MappedEdp[]} edps
 * @property {{ levyAmountExcludingVat: number, levyAmountInflationAdjusted: number }|null} levyGbp - summed across all EDPs; null when edps is empty
 */

/**
 * @param {object} row - raw DB row carrying the quote's headline email columns
 * @returns {MappedEmail}
 */
const mapEmail = (row) => ({
  address: row.email_address,
  sendRequestAt: row.email_requested_at ?? null,
  notifySendStatus: row.notify_send_status ?? null,
  emailType: row.email_type ?? null,
  sendRetryCount: row.retry_count ?? null,
  notifyStatusUrl: row.email_notification_id
    ? buildNotifyStatusUrl(row.email_notification_id)
    : null
})

/**
 * @param {{ emailType: string, notifySendStatus: string|null, sendRetryCount: number|null, sendRequestAt: Date|null, notificationId?: string|null }} n - an email notification record
 * @returns {object}
 */
const mapEmailNotification = (n) => ({
  emailType: n.emailType,
  notifySendStatus: n.notifySendStatus,
  sendRetryCount: n.sendRetryCount,
  sendRequestAt: n.sendRequestAt,
  notificationId: n.notificationId ?? null,
  notifyStatusUrl: n.notificationId
    ? buildNotifyStatusUrl(n.notificationId)
    : null
})

/**
 * @param {object[]} rows - raw DB rows for a single quote (multiple rows due to EDP join)
 * @returns {MappedQuote|null}
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
      edpStartDate: r.edp_start_date,
      impact: r.impact,
      catchments: r.catchments ?? null,
      levyGbp: {
        amountExcludingVat: r.levy_provisional_amount,
        amountInflationAdjusted: r.levy_inflation_adjusted,
        baseAmount: r.levy_provisional_amount,
        modelVersion: r.levy_model_version,
        journey: r.journey,
        createdAt: r.levy_created_at,
        calculatedAt: r.levy_calculated_at,
        baseChargePerUnit: r.levy_base_charge_per_unit,
        units: r.levy_units,
        originalBaseAmount: r.levy_original_base_amount,
        originalBaseChargePerUnit: r.levy_original_base_charge_per_unit
      },
      previousLevyCalculations: r.levy_history ?? []
    }))

  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    createdAt: row.created_at,
    commitmentCertificateCreatedAt:
      row.commitment_certificate_created_at ?? null,
    planningType: row.planning_type,
    housingUnits: row.residential_building_count,
    boundary: {
      geoJsonWgs84: row.boundary_geodata,
      userInputType: row.boundary_entry_type,
      filename: row.boundary_filename
    },
    email: mapEmail(row),
    emailNotifications: (row.email_notifications ?? []).map(
      mapEmailNotification
    ),
    disableAnalyticsAudit: row.disable_analytics_audit ?? false,
    edps,
    levyGbp: edps.length ? getLevyAmount(edps) : null
  }
}
