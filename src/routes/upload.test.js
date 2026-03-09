import {
  initiateUpload as initiateUploadService,
  getUploadStatus
} from '../services/cdp-uploader/cdp-uploader.js'
import { setupTestServer } from '../test-utils/setup-test-server.js'

vi.mock('../services/cdp-uploader/cdp-uploader.js')

describe('Upload routes', () => {
  const getServer = setupTestServer()

  describe('POST /upload/initiate', () => {
    it('should return the upload result', async () => {
      vi.mocked(initiateUploadService).mockResolvedValue({
        uploadId: 'abc-123',
        uploadUrl: '/upload/abc-123'
      })

      const response = await getServer().inject({
        method: 'POST',
        url: '/upload/initiate',
        payload: {
          redirect: 'http://localhost:3000/done',
          s3Bucket: 'boundaries',
          s3Path: 'test-uploads',
          metadata: { source: 'test' }
        }
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body.uploadId).toBe('abc-123')
      expect(body.uploadUrl).toBe('/upload/abc-123')
      expect(initiateUploadService).toHaveBeenCalledWith({
        redirect: 'http://localhost:3000/done',
        s3Bucket: 'boundaries',
        s3Path: 'test-uploads',
        metadata: { source: 'test' }
      })
    })
  })

  describe('GET /upload/{uploadId}/status', () => {
    it('should return the upload status', async () => {
      vi.mocked(getUploadStatus).mockResolvedValue({
        uploadStatus: 'ready'
      })

      const response = await getServer().inject({
        method: 'GET',
        url: '/upload/abc-123/status'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body.uploadStatus).toBe('ready')
      expect(getUploadStatus).toHaveBeenCalledWith('abc-123')
    })
  })
})
