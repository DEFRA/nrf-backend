import { getUploadDetails } from '../services/cdp-uploader/cdp-uploader.js'
import { downloadFromS3 } from '../services/s3/s3-client.js'
import { checkBoundary } from '../services/impact-assessor/impact-assessor.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { setupTestServer } from '../test-utils/setup-test-server.js'

vi.mock('../services/cdp-uploader/cdp-uploader.js')
vi.mock('../services/s3/s3-client.js')
vi.mock('../services/impact-assessor/impact-assessor.js')

describe('Boundary routes', () => {
  const getServer = setupTestServer()
  const uploadId = 'f6b667d8-998f-4f55-8a20-204c0c289147'

  describe('POST /boundary/check/{uploadId}', () => {
    it('should return geojson on success', async () => {
      const mockGeojson = {
        type: 'FeatureCollection',
        features: []
      }

      vi.mocked(getUploadDetails).mockResolvedValue({
        uploadStatus: 'ready',
        form: {
          file: {
            s3Key: 'uploads/test.geojson',
            s3Bucket: 'boundaries',
            filename: 'test.geojson',
            contentType: 'application/geo+json'
          }
        }
      })

      vi.mocked(downloadFromS3).mockResolvedValue({
        body: Buffer.from('{}'),
        contentType: 'application/geo+json',
        filename: 'test.geojson'
      })

      vi.mocked(checkBoundary).mockResolvedValue({ geojson: mockGeojson })

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body.type).toBe('FeatureCollection')
      expect(getUploadDetails).toHaveBeenCalledWith(uploadId)
      expect(downloadFromS3).toHaveBeenCalledWith(
        'boundaries',
        'uploads/test.geojson'
      )
      expect(checkBoundary).toHaveBeenCalledWith(
        expect.any(Buffer),
        'test.geojson',
        'application/geo+json'
      )
    })

    it('should return 404 when upload details have error', async () => {
      vi.mocked(getUploadDetails).mockResolvedValue({
        uploadStatus: 'error',
        error: 'Unable to fetch upload details'
      })

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.notFound)
    })

    it('should return 400 when upload is not ready', async () => {
      vi.mocked(getUploadDetails).mockResolvedValue({
        uploadStatus: 'pending'
      })

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })

    it('should return 404 when no file info in upload details', async () => {
      vi.mocked(getUploadDetails).mockResolvedValue({
        uploadStatus: 'ready',
        form: {}
      })

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.notFound)
    })

    it('should return 502 when S3 download fails', async () => {
      vi.mocked(getUploadDetails).mockResolvedValue({
        uploadStatus: 'ready',
        form: {
          file: {
            s3Key: 'uploads/test.geojson',
            filename: 'test.geojson',
            contentType: 'application/geo+json'
          }
        }
      })

      vi.mocked(downloadFromS3).mockRejectedValue(new Error('S3 error'))

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.badGateway)
    })

    it('should return error from impact assessor', async () => {
      vi.mocked(getUploadDetails).mockResolvedValue({
        uploadStatus: 'ready',
        form: {
          file: {
            s3Key: 'uploads/bad.txt',
            filename: 'bad.txt',
            contentType: 'text/plain'
          }
        }
      })

      vi.mocked(downloadFromS3).mockResolvedValue({
        body: Buffer.from('not geometry'),
        contentType: 'text/plain',
        filename: 'bad.txt'
      })

      vi.mocked(checkBoundary).mockResolvedValue({
        error: 'Unsupported file format',
        statusCode: statusCodes.badRequest
      })

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('Unsupported file format')
    })
  })
})
