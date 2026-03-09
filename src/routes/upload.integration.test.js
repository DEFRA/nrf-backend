import { setupTestServer } from '../test-utils/setup-test-server.js'

describe('Upload routes (integration)', () => {
  const getServer = setupTestServer()

  describe('POST /upload/initiate', () => {
    it('should return uploadId and uploadUrl', async () => {
      const response = await getServer().inject({
        method: 'POST',
        url: '/upload/initiate',
        payload: {
          redirect: 'http://localhost:3000/upload-complete',
          s3Bucket: 'boundaries',
          s3Path: 'test-uploads',
          metadata: { source: 'integration-test' }
        }
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body.uploadId).toBeDefined()
      expect(body.uploadUrl).toBeDefined()
    })
  })

  describe('GET /upload/{uploadId}/status', () => {
    it('should return uploadStatus for a valid upload', async () => {
      const initiateRes = await getServer().inject({
        method: 'POST',
        url: '/upload/initiate',
        payload: {
          redirect: 'http://localhost:3000/upload-complete',
          s3Bucket: 'boundaries',
          s3Path: 'test-uploads'
        }
      })

      expect(initiateRes.statusCode).toBe(200)
      const { uploadId } = JSON.parse(initiateRes.payload)

      const statusRes = await getServer().inject({
        method: 'GET',
        url: `/upload/${uploadId}/status`
      })

      expect(statusRes.statusCode).toBe(200)
      const body = JSON.parse(statusRes.payload)
      expect(['initiated', 'pending', 'ready']).toContain(body.uploadStatus)
    })
  })
})
