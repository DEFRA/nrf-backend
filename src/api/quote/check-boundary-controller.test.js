import { downloadBoundaryFile } from '../../services/s3/s3-client.js'
import { submitBoundaryCheck } from '../../services/impact-assessor/impact-assessor.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

vi.mock('../../services/s3/s3-client.js')
vi.mock('../../services/impact-assessor/impact-assessor.js')

const uploadId = 'f6b667d8-998f-4f55-8a20-204c0c289147'

describe('POST /quote/check-boundary/{id}', () => {
  const getServer = setupTestServer()

  it('should return 202 with the job info', async () => {
    vi.mocked(downloadBoundaryFile).mockResolvedValue({
      buffer: Buffer.from('test content'),
      filename: 'boundary.geojson',
      contentType: 'application/geo+json'
    })

    vi.mocked(submitBoundaryCheck).mockResolvedValue({
      job_id: 'job-123',
      status: 'pending',
      poll_url: '/assess/job-123'
    })

    const response = await getServer().inject({
      method: 'POST',
      url: `/quote/check-boundary/${uploadId}`
    })

    expect(response.statusCode).toBe(202)
    const body = JSON.parse(response.payload)
    expect(body).toEqual({
      jobId: 'job-123',
      status: 'pending',
      pollUrl: '/assess/job-123'
    })

    expect(downloadBoundaryFile).toHaveBeenCalledWith(uploadId)
    expect(submitBoundaryCheck).toHaveBeenCalledWith(
      Buffer.from('test content'),
      'boundary.geojson'
    )
  })

  it('should return 404 when no boundary file is found', async () => {
    vi.mocked(downloadBoundaryFile).mockRejectedValue(
      new Error('No boundary file found')
    )

    const response = await getServer().inject({
      method: 'POST',
      url: `/quote/check-boundary/${uploadId}`
    })

    expect(response.statusCode).toBe(404)
  })

  it('should return 400 for an invalid UUID', async () => {
    const response = await getServer().inject({
      method: 'POST',
      url: '/quote/check-boundary/not-a-uuid'
    })

    expect(response.statusCode).toBe(400)
  })
})
