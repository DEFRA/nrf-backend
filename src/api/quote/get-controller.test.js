import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  createQuoteWithEdps,
  sendGetRequest
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/sns/publish-event.js')

describe('Get quote endpoint', () => {
  const getServer = setupTestServer()

  it('should return the quote without needing an access token', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendGetRequest({ server: getServer(), reference })

    expect(response.statusCode).toBe(statusCodes.ok)
    expect(JSON.parse(response.payload).reference).toBe(reference)
  })

  it('should return the totalled levyGbp when the quote has EDPs', async () => {
    const reference = await createQuoteWithEdps(getServer())

    const response = await sendGetRequest({ server: getServer(), reference })

    const quote = JSON.parse(response.payload)
    expect(quote.edps).toHaveLength(1)
    expect(quote.levyGbp).toEqual({
      levyAmountExcludingVat: 1100,
      levyAmountInflationAdjusted: 1122
    })
  })

  it('should return 404 for an unknown reference', async () => {
    const response = await sendGetRequest({
      server: getServer(),
      reference: 'NRL-999999'
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
