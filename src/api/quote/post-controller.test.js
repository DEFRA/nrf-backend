import { routePath } from '../../routes/quote.js'
import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

vi.mock('../../services/send-email/notify-client.js')

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
  email: 'developer@housebuilder.com'
}

describe('Submit quote endpoint', () => {
  const getServer = setupTestServer()
  let notifySendEmail

  beforeEach(() => {
    notifySendEmail = vi.fn()
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: notifySendEmail
    })
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

  it('should send a quote email', async () => {
    await sendPostRequest({
      server: getServer(),
      payload: validPayload
    })
    expect(notifySendEmail).toHaveBeenCalled()
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
