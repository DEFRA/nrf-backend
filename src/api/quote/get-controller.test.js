import { routePath } from '../../routes/quote.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

vi.mock('../../services/send-email/notify-client.js')

const sendPostRequest = ({ server, payload }) => {
  return server.inject({
    method: 'POST',
    url: routePath,
    payload
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
    const postResponse = await sendPostRequest({
      server: getServer(),
      payload: { emailAddress: 'developer@housebuilder.com' }
    })
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendGetRequest({ server: getServer(), reference })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({ reference })
  })

  it('should return 404 when the quote reference does not exist', async () => {
    const response = await sendGetRequest({
      server: getServer(),
      reference: 'NOTFOUND00'
    })

    expect(response.statusCode).toBe(404)
  })
})
