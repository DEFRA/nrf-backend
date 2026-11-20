import { mapQuoteRows } from './quote-row-mapper.js'
import { buildNotifyStatusUrl } from '../../../common/helpers/notify-status-url.js'

vi.mock('../../../common/helpers/notify-status-url.js', () => ({
  buildNotifyStatusUrl: vi.fn()
}))

const baseRow = {
  id: 1,
  reference: 'NRL-000001',
  user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  created_at: '2026-03-23T00:00:00.000Z',
  residential_building_count: 10,
  boundary_geodata: '{"type":"Polygon"}',
  boundary_entry_type: 'upload',
  boundary_filename: 'site-boundary.shp',
  email_address: 'developer@housebuilder.com'
}

describe('mapQuoteRows', () => {
  it('maps the commitment certificate creation time', () => {
    const createdAt = new Date('2026-05-01T10:30:00.000Z')

    const result = mapQuoteRows([
      {
        ...baseRow,
        edp_id: null,
        commitment_certificate_created_at: createdAt
      }
    ])

    expect(result.commitmentCertificateCreatedAt).toBe(createdAt)
  })

  it('returns mapped quote with EDPs when given populated rows', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: 'EDP-001',
        edp_name: 'Test EDP',
        impact: { score: 1 },
        catchments: null,
        levy_provisional_amount: '1000.00',
        levy_inflation_adjusted: '1122.00',
        levy_model_version: 1,
        levy_calculated_at: new Date('2026-09-14T10:30:15Z'),
        levy_original_base_amount: '26750.00',
        levy_base_charge_per_unit: '2675.00',
        levy_original_base_charge_per_unit: '2675.00',
        levy_units: 10,
        edp_start_date: '2026-01-01'
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result).toEqual({
      id: 1,
      reference: 'NRL-000001',
      userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      createdAt: '2026-03-23T00:00:00.000Z',
      commitmentCertificateCreatedAt: null,
      planningType: undefined,
      housingUnits: 10,
      boundary: {
        geoJsonWgs84: '{"type":"Polygon"}',
        userInputType: 'upload',
        filename: 'site-boundary.shp'
      },
      email: {
        address: 'developer@housebuilder.com',
        sendRequestAt: null,
        notifySendStatus: null,
        emailType: null,
        sendRetryCount: null,
        notifyStatusUrl: null
      },
      emailNotifications: [],
      disableAnalyticsAudit: false,
      edps: [
        {
          edpId: 'EDP-001',
          edpName: 'Test EDP',
          edpStartDate: '2026-01-01',
          impact: { score: 1 },
          catchments: null,
          levyGbp: {
            amountExcludingVat: '1000.00',
            amountInflationAdjusted: '1122.00',
            baseAmount: '1000.00',
            modelVersion: 1,
            journey: undefined,
            createdAt: undefined,
            calculatedAt: new Date('2026-09-14T10:30:15Z'),
            originalBaseAmount: '26750.00',
            baseChargePerUnit: '2675.00',
            originalBaseChargePerUnit: '2675.00',
            units: 10
          },
          previousLevyCalculations: []
        }
      ],
      levyGbp: {
        levyAmountExcludingVat: 1000,
        levyAmountInflationAdjusted: 1122
      }
    })
  })

  it('includes catchments array on EDP when present', () => {
    const catchments = [
      {
        label: 'Upper River',
        catchmentId: 'C-001',
        catchmentOverlapPercentage: 75.5
      },
      {
        label: 'Lower River',
        catchmentId: null,
        catchmentOverlapPercentage: 24.5
      }
    ]
    const rows = [
      {
        ...baseRow,
        edp_id: 'EDP-001',
        edp_name: 'Test EDP',
        impact: { score: 1 },
        catchments,
        levy_provisional_amount: '1000.00',
        levy_inflation_adjusted: '1122.00',
        levy_model_version: 1
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result.edps[0].catchments).toEqual(catchments)
  })

  it('maps the latest email notification status and builds a Notify status URL', () => {
    vi.mocked(buildNotifyStatusUrl).mockReturnValue('https://status/abc')
    const notificationId = '47cbb989-9546-418c-8828-232c3dc57537'
    const requestedAt = '2026-08-01T09:00:00.000Z'
    const rows = [
      {
        ...baseRow,
        notify_send_status: 'delivered',
        email_notification_id: notificationId,
        email_requested_at: requestedAt,
        email_type: 'quote_results',
        retry_count: 2,
        edp_id: null,
        edp_name: null,
        impact: null,
        levy_provisional_amount: null,
        levy_inflation_adjusted: null,
        levy_model_version: null
      }
    ]

    const result = mapQuoteRows(rows)

    expect(buildNotifyStatusUrl).toHaveBeenCalledWith(notificationId)
    expect(result.email).toEqual({
      address: 'developer@housebuilder.com',
      sendRequestAt: requestedAt,
      notifySendStatus: 'delivered',
      emailType: 'quote_results',
      sendRetryCount: 2,
      notifyStatusUrl: 'https://status/abc'
    })
  })

  it('maps all email notifications into emailNotifications array ordered by sent date', () => {
    vi.mocked(buildNotifyStatusUrl).mockReturnValue('https://status/abc')
    const notificationId = '47cbb989-9546-418c-8828-232c3dc57537'
    const rows = [
      {
        ...baseRow,
        edp_id: null,
        email_notifications: [
          {
            emailType: 'quote_results',
            notifySendStatus: 'delivered',
            sendRetryCount: 0,
            sendRequestAt: '2026-08-01T09:00:00.000Z',
            notificationId
          },
          {
            emailType: 'resend_quote_link',
            notifySendStatus: null,
            sendRetryCount: 1,
            sendRequestAt: '2026-08-02T10:00:00.000Z',
            notificationId: null
          }
        ]
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result.emailNotifications).toEqual([
      {
        emailType: 'quote_results',
        notifySendStatus: 'delivered',
        sendRetryCount: 0,
        sendRequestAt: '2026-08-01T09:00:00.000Z',
        notificationId,
        notifyStatusUrl: 'https://status/abc'
      },
      {
        emailType: 'resend_quote_link',
        notifySendStatus: null,
        sendRetryCount: 1,
        sendRequestAt: '2026-08-02T10:00:00.000Z',
        notificationId: null,
        notifyStatusUrl: null
      }
    ])
  })

  it('returns mapped quote with empty edps when edp_id is null', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: null,
        edp_name: null,
        impact: null,
        levy_provisional_amount: null,
        levy_inflation_adjusted: null,
        levy_model_version: null
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result.edps).toEqual([])
    expect(result.levyGbp).toBeNull()
  })

  it('returns null when rows array is empty', () => {
    expect(mapQuoteRows([])).toBeNull()
  })

  it('maps multiple EDP rows for the same quote correctly', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: 'EDP-001',
        edp_name: 'First EDP',
        impact: { nitrogenBand: 'low' },
        levy_provisional_amount: '1000.00',
        levy_inflation_adjusted: '1122.00',
        levy_model_version: 1
      },
      {
        ...baseRow,
        edp_id: 'EDP-002',
        edp_name: 'Second EDP',
        impact: { phosphorusBand: 'high' },
        levy_provisional_amount: '2000.00',
        levy_inflation_adjusted: '2122.00',
        levy_model_version: 1
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result.edps).toHaveLength(2)
    expect(result.edps[0]).toMatchObject({
      edpId: 'EDP-001',
      edpName: 'First EDP'
    })
    expect(result.edps[1]).toMatchObject({
      edpId: 'EDP-002',
      edpName: 'Second EDP'
    })
  })
})

describe('mapQuoteRows levy calculation history', () => {
  const baseRow = {
    id: 1,
    reference: 'NRL-000001',
    edp_id: 123,
    edp_name: 'Norfolk Fens east',
    impact: {},
    levy_provisional_amount: '26750.00',
    levy_inflation_adjusted: '26750.00',
    levy_model_version: 1
  }

  it('maps the current calculation and the earlier ones for an EDP', () => {
    const earlier = {
      journey: 'quote',
      provisionalAmount: '26000.00'
    }
    const result = mapQuoteRows([
      {
        ...baseRow,
        journey: 'request_to_use',
        levy_created_at: new Date('2026-11-17T12:00:00Z'),
        levy_calculated_at: new Date('2026-11-17T11:59:00Z'),
        levy_base_charge_per_unit: '2675.00',
        levy_units: 10,
        edp_start_date: '2026-01-01',
        levy_history: [earlier]
      }
    ])

    expect(result.edps[0].levyGbp).toMatchObject({
      journey: 'request_to_use',
      calculatedAt: new Date('2026-11-17T11:59:00Z'),
      baseChargePerUnit: '2675.00',
      units: 10
    })
    expect(result.edps[0].previousLevyCalculations).toEqual([earlier])
  })
})
