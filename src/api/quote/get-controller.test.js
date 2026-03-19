import { routePath } from '../../routes/quote.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

const validPayload = {
  boundaryEntryType: 'draw',
  developmentTypes: ['housing', 'other-residential'],
  residentialBuildingCount: 10,
  peopleCount: 5,
  email: 'developer@housebuilder.com'
}

const sendPostRequest = ({ server }) => {
  return server.inject({
    method: 'POST',
    url: routePath,
    payload: validPayload
  })
}

const sendGetRequest = ({ server, reference }) => {
  return server.inject({
    method: 'GET',
    url: `${routePath}/${reference}`
  })
}

describe('Get quote endpoint', () => {
  const getServer = setupTestServer()

  it('should return 200 with the quote reference', async () => {
    const postResponse = await sendPostRequest({ server: getServer() })
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendGetRequest({ server: getServer(), reference })

    expect(response.statusCode).toBe(statusCodes.ok)
    expect(JSON.parse(response.payload)).toEqual({ reference })
  })

  it('should return 404 when the quote reference does not exist', async () => {
    const response = await sendGetRequest({
      server: getServer(),
      reference: 'NRF-999999'
    })

    expect(response.statusCode).toBe(statusCodes.notFound)
  })

  it('should return 400 when the reference format is invalid', async () => {
    const response = await sendGetRequest({
      server: getServer(),
      reference: 'INVALID'
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
