import { mockNotifyClient } from '../../test-utils/mock-notify-client.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  commitmentLevy,
  validEdpsPayload
} from '../../test-utils/fixtures/quotePayloads.js'
import {
  createQuote,
  sendGetRequest,
  sendPatchRequest,
  sendCommitmentCertificateRequest
} from '../../test-utils/quote-request-helpers.js'

vi.mock('@defra/cdp-auditing')
vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

describe('Commitment certificate endpoint', () => {
  const getServer = setupTestServer()

  beforeEach(() => {
    mockNotifyClient()
  })

  const createReference = async () => {
    const postResponse = await createQuote(getServer())
    return JSON.parse(postResponse.payload).reference
  }

  const createQuoteWithResults = async () => {
    const reference = await createReference()
    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })
    return reference
  }

  const getQuote = async (reference) => {
    const response = await sendGetRequest({ server: getServer(), reference })
    return JSON.parse(response.payload)
  }

  it('should have no commitment certificate time on a new quote', async () => {
    const reference = await createReference()

    const quote = await getQuote(reference)

    expect(quote.commitmentCertificateCreatedAt).toBeNull()
  })

  it('should record the time and return it from the get quote endpoint', async () => {
    const reference = await createQuoteWithResults()
    const before = Date.now()

    const response = await sendCommitmentCertificateRequest({
      server: getServer(),
      reference
    })

    const quote = await getQuote(reference)
    expect(response.statusCode).toBe(200)
    expect(
      new Date(quote.commitmentCertificateCreatedAt).getTime()
    ).toBeGreaterThanOrEqual(before - 1000)
  })

  it('should reject a repeat call and keep the first time', async () => {
    const reference = await createQuoteWithResults()
    await sendCommitmentCertificateRequest({ server: getServer(), reference })
    const first = await getQuote(reference)

    const response = await sendCommitmentCertificateRequest({
      server: getServer(),
      reference
    })

    const second = await getQuote(reference)
    expect(response.statusCode).toBe(409)
    expect(second.commitmentCertificateCreatedAt).toBe(
      first.commitmentCertificateCreatedAt
    )
  })

  it('should let exactly one of several simultaneous calls succeed', async () => {
    const reference = await createQuoteWithResults()

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        sendCommitmentCertificateRequest({ server: getServer(), reference })
      )
    )

    const responseCodes = responses
      .map((response) => response.statusCode)
      .sort()
    expect(responseCodes).toEqual([200, 409, 409, 409, 409])
  })

  it('should return 404 for an unknown quote', async () => {
    const response = await sendCommitmentCertificateRequest({
      server: getServer(),
      reference: 'NRL-999999'
    })

    expect(response.statusCode).toBe(404)
  })

  it('should return 400 for an invalid reference', async () => {
    const response = await sendCommitmentCertificateRequest({
      server: getServer(),
      reference: 'invalid'
    })

    expect(response.statusCode).toBe(400)
  })

  it.each([
    ['false', { createCommitmentCertificate: false, levy: commitmentLevy }],
    ['missing', {}],
    [
      'not a boolean',
      { createCommitmentCertificate: 'yes', levy: commitmentLevy }
    ],
    [
      'an unexpected extra field',
      { createCommitmentCertificate: true, levy: commitmentLevy, other: 1 }
    ]
  ])(
    'should return 400 and not record the time when the flag is %s',
    async (_description, payload) => {
      const reference = await createReference()

      const response = await sendCommitmentCertificateRequest({
        server: getServer(),
        reference,
        payload
      })

      const quote = await getQuote(reference)
      expect(response.statusCode).toBe(400)
      expect(quote.commitmentCertificateCreatedAt).toBeNull()
    }
  )

  describe('levy calculation history', () => {
    it('should add a request to use row with the accepted levy, keeping the quote row', async () => {
      const reference = await createQuoteWithResults()

      await sendCommitmentCertificateRequest({ server: getServer(), reference })

      const { edps } = await getQuote(reference)
      expect(edps[0].levyGbp).toMatchObject({
        journey: 'request_to_use',
        amountExcludingVat: '30000.00',
        baseChargePerUnit: '3000.00',
        units: 10
      })
      expect(edps[0].previousLevyCalculations).toEqual([
        expect.objectContaining({
          journey: 'quote',
          provisionalAmount: '1000.00'
        })
      ])
    })

    it('should copy the impact and catchments from the quote results', async () => {
      const reference = await createQuoteWithResults()

      await sendCommitmentCertificateRequest({ server: getServer(), reference })

      const { edps } = await getQuote(reference)
      expect(edps[0]).toMatchObject({
        edpId: validEdpsPayload.edps[0].edpId,
        edpName: validEdpsPayload.edps[0].edpName,
        impact: validEdpsPayload.edps[0].impact,
        catchments: validEdpsPayload.edps[0].catchments
      })
    })

    it('should add the row even when the amounts are unchanged', async () => {
      const reference = await createQuoteWithResults()
      const same = {
        ...commitmentLevy,
        provisionalAmount: 1100,
        inflationAdjustedAmount: 1122
      }

      await sendCommitmentCertificateRequest({
        server: getServer(),
        reference,
        payload: { createCommitmentCertificate: true, levy: same }
      })

      const { edps } = await getQuote(reference)
      expect(edps[0].levyGbp.journey).toBe('request_to_use')
      expect(edps[0].previousLevyCalculations).toHaveLength(1)
    })

    it('should return 409 and record nothing when the quote has no levy results', async () => {
      const reference = await createReference()

      const response = await sendCommitmentCertificateRequest({
        server: getServer(),
        reference
      })

      const quote = await getQuote(reference)
      expect(response.statusCode).toBe(409)
      expect(quote.commitmentCertificateCreatedAt).toBeNull()
    })

    it('should return 400 and record nothing when the levy is missing', async () => {
      const reference = await createQuoteWithResults()

      const response = await sendCommitmentCertificateRequest({
        server: getServer(),
        reference,
        payload: { createCommitmentCertificate: true }
      })

      const quote = await getQuote(reference)
      expect(response.statusCode).toBe(400)
      expect(quote.commitmentCertificateCreatedAt).toBeNull()
      expect(quote.edps[0].previousLevyCalculations).toEqual([])
    })
  })
})
