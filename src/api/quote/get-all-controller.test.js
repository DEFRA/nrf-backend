import { routePath } from '../../routes/quote.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import { boundaryGeojson } from '../../test-utils/fixtures/boundaryGeojson.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

const validPayload = {
  planningType: 'full-planning-permission',
  boundaryEntryType: 'draw',
  boundaryGeojson,
  housingUnits: 10,
  email: 'developer@housebuilder.com'
}

const sendGetAllRequest = ({ server }) => {
  return server.inject({ method: 'GET', url: routePath })
}

const sendPostRequest = ({ server }) => {
  return server.inject({
    method: 'POST',
    url: routePath,
    payload: validPayload
  })
}

describe('Get all quotes endpoint', () => {
  const getServer = setupTestServer()

  it('returns 200 with an array', async () => {
    const response = await sendGetAllRequest({ server: getServer() })

    expect(response.statusCode).toBe(statusCodes.ok)
    expect(Array.isArray(JSON.parse(response.payload))).toBe(true)
  })

  it('returns all quotes with the expected shape', async () => {
    await sendPostRequest({ server: getServer() })

    const response = await sendGetAllRequest({ server: getServer() })

    expect(response.statusCode).toBe(statusCodes.ok)
    const quotes = JSON.parse(response.payload)
    expect(quotes.length).toBeGreaterThan(0)
    expect(quotes[0]).toMatchObject({
      id: expect.any(Number),
      reference: expect.stringMatching(/^NRL-\d{6}$/),
      createdAt: expect.any(String),
      housingUnits: expect.any(Number),
      boundary: expect.any(Object),
      email: expect.any(Object),
      edps: expect.any(Array)
    })
  })

  it('includes newly created quotes in the response', async () => {
    const postResponse1 = await sendPostRequest({ server: getServer() })
    const postResponse2 = await sendPostRequest({ server: getServer() })
    expect(postResponse1.statusCode).toBe(statusCodes.created)
    expect(postResponse2.statusCode).toBe(statusCodes.created)
    const { reference: ref1 } = JSON.parse(postResponse1.payload)
    const { reference: ref2 } = JSON.parse(postResponse2.payload)

    const response = await sendGetAllRequest({ server: getServer() })

    const quotes = JSON.parse(response.payload)
    const references = quotes.map((q) => q.reference)
    expect(references).toContain(ref1)
    expect(references).toContain(ref2)
  })
})
