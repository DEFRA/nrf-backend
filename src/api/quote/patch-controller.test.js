import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import { validEdpsPayload } from '../../test-utils/fixtures/quotePayloads.js'
import {
  createQuote,
  sendGetRequest,
  sendPatchRequest
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

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

  it('should include a quote access link in the email', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    const emailOptions = notifySendEmail.mock.calls[0][2]
    expect(emailOptions.personalisation.quoteAccessLink).toMatch(
      new RegExp(`/quote/${reference}/[A-Za-z0-9_-]{43}$`)
    )
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
    const { edps, levyGbp } = JSON.parse(getResponse.payload)

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
    expect(levyGbp).toBe('£100 - £200')
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

  describe('when a second PATCH request is sent for the same reference', () => {
    it('should not send an email when no EDP fields have changed', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })
      notifySendEmail.mockClear()

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })

      expect(notifySendEmail).not.toHaveBeenCalled()
    })

    it('should send an email when an EDP field has changed', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })
      notifySendEmail.mockClear()

      const updatedPayload = {
        edps: [{ ...validEdpsPayload.edps[0], levyGbp: { min: 150, max: 250 } }]
      }

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: updatedPayload
      })

      expect(notifySendEmail).toHaveBeenCalled()
    })

    it('should update the email sent date when an EDP field has changed', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })

      const firstGetResponse = await sendGetRequest({
        server: getServer(),
        reference
      })
      const firstSentAt = JSON.parse(firstGetResponse.payload).email
        .sendRequestAt

      const updatedPayload = {
        edps: [{ ...validEdpsPayload.edps[0], levyGbp: { min: 150, max: 250 } }]
      }

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: updatedPayload
      })

      const secondGetResponse = await sendGetRequest({
        server: getServer(),
        reference
      })
      const secondSentAt = JSON.parse(secondGetResponse.payload).email
        .sendRequestAt

      expect(secondSentAt).not.toBeNull()
      expect(new Date(secondSentAt).getTime()).not.toBeNaN()
      expect(secondSentAt).not.toBe(firstSentAt)
    })

    it('should not update the email sent date when no EDP fields have changed', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })

      const firstGetResponse = await sendGetRequest({
        server: getServer(),
        reference
      })
      const firstSentAt = JSON.parse(firstGetResponse.payload).email
        .sendRequestAt

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })

      const secondGetResponse = await sendGetRequest({
        server: getServer(),
        reference
      })
      const secondSentAt = JSON.parse(secondGetResponse.payload).email
        .sendRequestAt

      expect(secondSentAt).toBe(firstSentAt)
    })
  })
})
