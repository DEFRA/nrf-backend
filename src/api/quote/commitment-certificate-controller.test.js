import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  sendGetRequest,
  sendCommitmentCertificateRequest
} from '../../test-utils/quote-request-helpers.js'

vi.mock('@defra/cdp-auditing')
vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

describe('Commitment certificate endpoint', () => {
  const getServer = setupTestServer()

  const createReference = async () => {
    const postResponse = await createQuote(getServer())
    return JSON.parse(postResponse.payload).reference
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
    const reference = await createReference()
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
    const reference = await createReference()
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
    const reference = await createReference()

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
    ['false', { createCommitmentCertificate: false }],
    ['missing', {}],
    ['not a boolean', { createCommitmentCertificate: 'yes' }],
    [
      'an unexpected extra field',
      { createCommitmentCertificate: true, other: 1 }
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
})
