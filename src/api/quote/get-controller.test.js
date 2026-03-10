import { routePath } from '../../routes/quote.js'
import { dbGetQuote } from '../../services/db/quotes/queries.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

vi.mock('../../services/db/quotes/queries.js')

const sendGetRequest = ({ server, reference }) => {
  return server.inject({
    method: 'GET',
    url: `${routePath}/${reference}`
  })
}

describe('Get quote endpoint', () => {
  const getServer = setupTestServer()

  it('should return 200 with the quote reference', async () => {
    const reference = 'NRF-000001'
    vi.mocked(dbGetQuote).mockResolvedValue({ id: 1, reference })

    const response = await sendGetRequest({ server: getServer(), reference })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({ reference })
  })

  it('should return 404 when the quote reference does not exist', async () => {
    vi.mocked(dbGetQuote).mockResolvedValue(null)

    const response = await sendGetRequest({
      server: getServer(),
      reference: 'NRF-999999'
    })

    expect(response.statusCode).toBe(404)
  })

  it('should return 400 when the reference format is invalid', async () => {
    const response = await sendGetRequest({
      server: getServer(),
      reference: 'INVALID'
    })

    expect(response.statusCode).toBe(400)
  })
})
