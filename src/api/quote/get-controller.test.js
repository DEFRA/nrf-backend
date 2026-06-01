import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  createQuoteWithEdps,
  sendGetRequest
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

describe('Get quote endpoint', () => {
  const getServer = setupTestServer()

  beforeEach(() => {
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: vi.fn().mockResolvedValue({ data: { id: 'notify-id' } })
    })
  })

  it('should return 200 with the quote when it has no EDPs', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendGetRequest({ server: getServer(), reference })

    expect(response.statusCode).toBe(statusCodes.ok)
    expect(JSON.parse(response.payload)).toEqual({
      id: expect.any(Number),
      reference,
      userId: expect.any(String),
      createdAt: expect.any(String),
      development: expect.any(Object),
      boundary: expect.any(Object),
      wasteWaterTreatmentWorksId: '101',
      wasteWaterTreatmentWorksName: 'Great Billing WRC',
      email: {
        address: 'developer@housebuilder.com',
        sendRequestAt: null
      },
      edps: [],
      levyGbp: null
    })
  })

  it('should return the totalled levyGbp when the quote has EDPs', async () => {
    const reference = await createQuoteWithEdps(getServer())

    const response = await sendGetRequest({ server: getServer(), reference })

    const { edps, levyGbp } = JSON.parse(response.payload)
    expect(edps).toHaveLength(1)
    expect(levyGbp).toBe('£100 - £200')
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
