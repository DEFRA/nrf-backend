import { routePath } from '../../routes/quote.js'
import { publishEvent } from '../../services/sns/publish-event.js'
import { getTraceId } from '@defra/hapi-tracing'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import { boundaryGeojson } from '../../test-utils/fixtures/boundaryGeojson.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')
vi.mock('@defra/hapi-tracing', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getTraceId: vi.fn() }
})

const sendPostRequest = ({ server, payload }) => {
  return server.inject({
    method: 'POST',
    url: routePath,
    payload
  })
}

const validPayload = {
  boundaryEntryType: 'draw',
  developmentTypes: ['housing', 'other-residential'],
  residentialBuildingCount: 10,
  peopleCount: 5,
  email: 'developer@housebuilder.com',
  boundaryGeojson
}

describe('Submit quote endpoint', () => {
  const getServer = setupTestServer()

  beforeEach(() => {
    vi.mocked(publishEvent).mockResolvedValue(true)
    vi.mocked(getTraceId).mockReturnValue('trace-abc-123')
  })

  it('should return 201 with the quote reference and a location header', async () => {
    const response = await sendPostRequest({
      server: getServer(),
      payload: validPayload
    })
    expect(response.statusCode).toBe(statusCodes.created)
    const { reference } = JSON.parse(response.payload)
    expect(reference).toMatch(/NRF-\d{6}/)
    expect(response.headers.location).toBe(`/quotes/${reference}`)
  })

  it('should publish an SNS event with the quote payload', async () => {
    await sendPostRequest({
      server: getServer(),
      payload: validPayload
    })
    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        topicArn: expect.any(String),
        data: {
          developmentTypes: ['housing', 'other-residential'],
          residentialBuildingCount: 10,
          peopleCount: 5,
          boundaryGeojson,
          reference: expect.stringMatching(/NRF-\d{6}/),
          traceId: 'trace-abc-123'
        }
      }),
      expect.anything()
    )
  })

  describe('Request payload validation', () => {
    it('should return 400 if email is missing', async () => {
      const { email: _, ...rest } = validPayload
      const response = await sendPostRequest({
        server: getServer(),
        payload: rest
      })
      expect(response.statusCode).toBe(statusCodes.badRequest)
    })

    it('should return 400 if boundaryEntryType is missing', async () => {
      const { boundaryEntryType: _, ...rest } = validPayload
      const response = await sendPostRequest({
        server: getServer(),
        payload: rest
      })
      expect(response.statusCode).toBe(statusCodes.badRequest)
    })

    it('should return 400 if developmentTypes is missing', async () => {
      const { developmentTypes: _, ...rest } = validPayload
      const response = await sendPostRequest({
        server: getServer(),
        payload: rest
      })
      expect(response.statusCode).toBe(statusCodes.badRequest)
    })

    it('should return 400 if residentialBuildingCount is missing when developmentTypes includes housing', async () => {
      const { residentialBuildingCount: _, ...rest } = validPayload
      const response = await sendPostRequest({
        server: getServer(),
        payload: rest
      })
      expect(response.statusCode).toBe(statusCodes.badRequest)
    })

    it('should return 400 if residentialBuildingCount is sent without housing in developmentTypes', async () => {
      const response = await sendPostRequest({
        server: getServer(),
        payload: {
          ...validPayload,
          developmentTypes: ['other-residential']
        }
      })
      expect(response.statusCode).toBe(statusCodes.badRequest)
    })
  })
})
