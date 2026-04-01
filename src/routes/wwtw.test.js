import { statusCodes } from '../common/constants/status-codes.js'
import { setupTestServer } from '../test-utils/setup-test-server.js'

vi.mock('../services/impact-assessor/impact-assessor.js')

const { findNearbyWasteWaterTreatmentWorks } =
  await import('../services/impact-assessor/impact-assessor.js')

const mockGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [400000, 300000],
      [400100, 300000],
      [400100, 300100],
      [400000, 300100],
      [400000, 300000]
    ]
  ]
}

describe('WWTW routes', () => {
  const getServer = setupTestServer()

  describe('POST /wwtw/nearby', () => {
    it('should return nearby WWTWs on success', async () => {
      const mockWwtws = [
        { wwtwId: '101', wwtwName: 'Great Billing WRC', distanceKm: 3.2 }
      ]

      vi.mocked(findNearbyWasteWaterTreatmentWorks).mockResolvedValue({
        nearbyWwtws: mockWwtws
      })

      const res = await getServer().inject({
        method: 'POST',
        url: '/wwtw/nearby',
        payload: { geometry: mockGeometry }
      })

      expect(res.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(res.payload)
      expect(body.nearbyWwtws).toEqual(mockWwtws)
    })

    it('should return error when impact assessor fails', async () => {
      vi.mocked(findNearbyWasteWaterTreatmentWorks).mockResolvedValue({
        error: 'Invalid geometry',
        statusCode: statusCodes.badRequest
      })

      const res = await getServer().inject({
        method: 'POST',
        url: '/wwtw/nearby',
        payload: { geometry: mockGeometry }
      })

      expect(res.statusCode).toBe(statusCodes.badRequest)
      const body = JSON.parse(res.payload)
      expect(body.error).toBe('Invalid geometry')
    })

    it('should return 502 when impact assessor has no status code', async () => {
      vi.mocked(findNearbyWasteWaterTreatmentWorks).mockResolvedValue({
        error: 'Unable to contact impact assessor service'
      })

      const res = await getServer().inject({
        method: 'POST',
        url: '/wwtw/nearby',
        payload: { geometry: mockGeometry }
      })

      expect(res.statusCode).toBe(statusCodes.badGateway)
    })

    it('should return 400 when geometry is missing', async () => {
      const res = await getServer().inject({
        method: 'POST',
        url: '/wwtw/nearby',
        payload: {}
      })

      expect(res.statusCode).toBe(statusCodes.badRequest)
    })
  })
})
