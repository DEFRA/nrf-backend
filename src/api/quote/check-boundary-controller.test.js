import { downloadBoundaryFile } from '../../services/s3/s3-client.js'
import { submitBoundaryCheck } from '../../services/impact-assessor/impact-assessor.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

vi.mock('../../services/s3/s3-client.js')
vi.mock('../../services/impact-assessor/impact-assessor.js')

const uploadId = 'f6b667d8-998f-4f55-8a20-204c0c289147'

describe('POST /quote/check-boundary/{id}', () => {
  const getServer = setupTestServer()

  it('should return 200 with the boundary check result', async () => {
    vi.mocked(downloadBoundaryFile).mockResolvedValue({
      buffer: Buffer.from('test content'),
      filename: 'boundary.geojson',
      contentType: 'application/geo+json'
    })

    const assessorResult = { valid: true, area_hectares: 12.5 }
    vi.mocked(submitBoundaryCheck).mockResolvedValue(assessorResult)

    const response = await getServer().inject({
      method: 'POST',
      url: `/quote/check-boundary/${uploadId}`
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body).toEqual(assessorResult)

    expect(downloadBoundaryFile).toHaveBeenCalledWith(uploadId)
    expect(submitBoundaryCheck).toHaveBeenCalledWith(
      Buffer.from('test content'),
      'boundary.geojson'
    )
  })

  it('should return 422 when no boundary file is found', async () => {
    vi.mocked(downloadBoundaryFile).mockRejectedValue(
      new Error('No boundary file found')
    )

    const response = await getServer().inject({
      method: 'POST',
      url: `/quote/check-boundary/${uploadId}`
    })

    expect(response.statusCode).toBe(422)
  })

  it('should return 400 for an invalid UUID', async () => {
    const response = await getServer().inject({
      method: 'POST',
      url: '/quote/check-boundary/not-a-uuid'
    })

    expect(response.statusCode).toBe(400)
  })
})
