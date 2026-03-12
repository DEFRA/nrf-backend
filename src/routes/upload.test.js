import {
  initiateUpload as initiateUploadService,
  getUploadStatus
} from '../services/cdp-uploader/cdp-uploader.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { setupTestServer } from '../test-utils/setup-test-server.js'

vi.mock('../services/cdp-uploader/cdp-uploader.js')

describe('Upload routes', () => {
  const getServer = setupTestServer()

  describe('POST /upload/initiate', () => {
    it('should return the upload result', async () => {
      vi.mocked(initiateUploadService).mockResolvedValue({
        uploadId: 'f6b667d8-998f-4f55-8a20-204c0c289147',
        uploadUrl: '/upload/f6b667d8-998f-4f55-8a20-204c0c289147'
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

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body.uploadId).toBe('f6b667d8-998f-4f55-8a20-204c0c289147')
      expect(body.uploadUrl).toBe(
        '/upload/f6b667d8-998f-4f55-8a20-204c0c289147'
      )
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
        url: '/upload/f6b667d8-998f-4f55-8a20-204c0c289147/status'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body.uploadStatus).toBe('ready')
      expect(getUploadStatus).toHaveBeenCalledWith(
        'f6b667d8-998f-4f55-8a20-204c0c289147'
      )
    })
  })
})
