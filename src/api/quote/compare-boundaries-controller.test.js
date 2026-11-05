import { http, HttpResponse } from 'msw'
import { setupMswServer } from '../../test-utils/setup-msw-server.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import { boundaryGeometryWgs84 } from '../../test-utils/fixtures/boundaryGeojson.js'
import {
  createQuote,
  sendCommitmentCertificateRequest
} from '../../test-utils/quote-request-helpers.js'

vi.mock('@defra/cdp-auditing')
vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

const COMPARE_URL = 'http://localhost:8085/compare-boundaries'
const UNKNOWN_REFERENCE = 'NRL-999999'
const currentBoundaryGeoJson = boundaryGeometryWgs84

describe('Compare boundaries endpoint', () => {
  const getServer = setupTestServer()
  const mswServer = setupMswServer()
  let compareRequests

  const mockCompare = (response = { boundariesMatch: true }, status = 200) => {
    compareRequests = []
    mswServer.use(
      http.post(COMPARE_URL, async ({ request }) => {
        compareRequests.push(await request.json())
        return HttpResponse.json(response, { status })
      })
    )
  }

  const createQuoteReference = async ({ committed = true } = {}) => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)
    if (committed) {
      await sendCommitmentCertificateRequest({ server: getServer(), reference })
    }
    return reference
  }

  const compare = (payload) =>
    getServer().inject({
      method: 'POST',
      url: '/quotes/compare-boundaries',
      payload
    })

  beforeEach(() => {
    mockCompare()
  })

  it('should send the original quote boundary and the supplied boundary to the impact assessor and return the result', async () => {
    const originalReference = await createQuoteReference()

    const response = await compare({
      originalReference,
      currentBoundaryGeoJson
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({ boundariesMatch: true })
    expect(compareRequests).toHaveLength(1)
    expect(compareRequests[0]).toEqual({
      boundaryOriginal: expect.objectContaining({ type: expect.any(String) }),
      boundaryNew: currentBoundaryGeoJson
    })
  })

  it('should return the impact assessor result when the boundaries differ', async () => {
    mockCompare({ boundariesMatch: false })
    const originalReference = await createQuoteReference()

    const response = await compare({
      originalReference,
      currentBoundaryGeoJson
    })

    expect(JSON.parse(response.payload)).toEqual({ boundariesMatch: false })
  })

  it('should return 404 when the original quote is unknown', async () => {
    const response = await compare({
      originalReference: UNKNOWN_REFERENCE,
      currentBoundaryGeoJson
    })

    expect(response.statusCode).toBe(404)
    expect(compareRequests).toEqual([])
  })

  it('should return 404 when the original quote has no commitment certificate', async () => {
    const originalReference = await createQuoteReference({ committed: false })

    const response = await compare({
      originalReference,
      currentBoundaryGeoJson
    })

    expect(response.statusCode).toBe(404)
    expect(compareRequests).toEqual([])
  })

  it('should pass through the impact assessor error status', async () => {
    mockCompare({}, 422)
    const originalReference = await createQuoteReference()

    const response = await compare({
      originalReference,
      currentBoundaryGeoJson
    })

    expect(response.statusCode).toBe(422)
    expect(JSON.parse(response.payload)).toHaveProperty('error')
  })

  it('should return 502 when the impact assessor is unreachable', async () => {
    mswServer.use(http.post(COMPARE_URL, () => HttpResponse.error()))
    const originalReference = await createQuoteReference()

    const response = await compare({
      originalReference,
      currentBoundaryGeoJson
    })

    expect(response.statusCode).toBe(502)
  })

  it.each([
    {
      scenario: 'the boundary is missing',
      payload: { originalReference: 'NRL-000001' }
    },
    {
      scenario: 'the boundary is not an object',
      payload: {
        originalReference: 'NRL-000001',
        currentBoundaryGeoJson: 'not-an-object'
      }
    },
    {
      scenario: 'the reference is missing',
      payload: { currentBoundaryGeoJson }
    },
    {
      scenario: 'the reference is in the wrong format',
      payload: { originalReference: 'bad', currentBoundaryGeoJson }
    }
  ])('should return 400 when $scenario', async ({ payload }) => {
    const response = await compare(payload)

    expect(response.statusCode).toBe(400)
  })
})
