import { routePath } from '../../routes/quote.js'
import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import { boundaryGeojson } from '../../test-utils/fixtures/boundaryGeojson.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

const validEdpsPayload = {
  edps: [
    {
      edpId: 123,
      edpName: 'Norfolk Fens east',
      edpType: 'NUTRIENT',
      impact: {
        nitrogenTotal: {
          amount: 80,
          unit: 'mg/I TP',
          band: { min: 1, max: 3 }
        },
        phosphorusTotal: {
          amount: 60,
          unit: 'mg/I TP',
          band: { min: 1, max: 4 }
        }
      },
      levyGbp: { min: 100, max: 200 }
    }
  ]
}

const createQuote = (server) =>
  server.inject({
    method: 'POST',
    url: routePath,
    payload: {
      boundaryEntryType: 'draw',
      developmentTypes: ['housing', 'other-residential'],
      residentialBuildingCount: 10,
      peopleCount: 5,
      email: 'developer@housebuilder.com',
      boundaryGeojson,
      DUMMY_TEST_PROPERTY: true
    }
  })

const sendPatchRequest = ({ server, reference, payload }) =>
  server.inject({
    method: 'PATCH',
    url: `${routePath}/${reference}`,
    payload
  })

const sendGetRequest = ({ server, reference }) =>
  server.inject({
    method: 'GET',
    url: `${routePath}/${reference}`
  })

describe('Patch quote endpoint', () => {
  const getServer = setupTestServer()
  let notifySendEmail

  beforeEach(() => {
    notifySendEmail = vi
      .fn()
      .mockResolvedValue({ data: { id: 'notify-id-123' } })
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: notifySendEmail
    })
  })

  it('should return 200 when EDP results are saved successfully', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    expect(response.statusCode).toBe(statusCodes.ok)
  })

  it('should send a quote email', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    expect(notifySendEmail).toHaveBeenCalled()
  })

  it('should write the email sent date to the database', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    const getResponse = await sendGetRequest({ server: getServer(), reference })
    const { email } = JSON.parse(getResponse.payload)

    expect(email.sendRequestAt).not.toBeNull()
    expect(new Date(email.sendRequestAt).getTime()).not.toBeNaN()
  })

  it('should return the saved EDPs when the quote is retrieved after patching', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    const getResponse = await sendGetRequest({ server: getServer(), reference })
    const { edps } = JSON.parse(getResponse.payload)

    expect(edps).toEqual([
      {
        edpId: 123,
        edpName: 'Norfolk Fens east',
        edpType: 'NUTRIENT',
        impact: {
          nitrogenTotal: {
            amount: 80,
            unit: 'mg/I TP',
            band: { min: 1, max: 3 }
          },
          phosphorusTotal: {
            amount: 60,
            unit: 'mg/I TP',
            band: { min: 1, max: 4 }
          }
        },
        levyGbp: { min: '100.00', max: '200.00' }
      }
    ])
  })

  it('should return 404 when the quote reference does not exist', async () => {
    const response = await sendPatchRequest({
      server: getServer(),
      reference: 'NRF-999999',
      payload: validEdpsPayload
    })

    expect(response.statusCode).toBe(statusCodes.notFound)
  })

  it('should return 400 when edps is missing', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendPatchRequest({
      server: getServer(),
      reference,
      payload: {}
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })

  it('should return 400 when the reference format is invalid', async () => {
    const response = await sendPatchRequest({
      server: getServer(),
      reference: 'INVALID',
      payload: validEdpsPayload
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
