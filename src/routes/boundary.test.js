import { fetch as undiciFetch, FormData } from 'undici'

import { statusCodes } from '../common/constants/status-codes.js'
import { setupTestServer } from '../test-utils/setup-test-server.js'
import * as cdpUploaderService from '../services/cdp-uploader/cdp-uploader.js'
import * as s3Client from '../services/s3/s3-client.js'

vi.mock('../services/impact-assessor/impact-assessor.js')

const { checkBoundary } =
  await import('../services/impact-assessor/impact-assessor.js')

const CDP_UPLOADER_URL = 'http://localhost:7338'
const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 15_000

/**
 * Upload a file to CDP Uploader and wait until it is ready.
 * Returns the uploadId once the status is 'ready'.
 */
async function uploadFileAndWaitUntilReady(server, fileBuffer, filename) {
  const initiateRes = await server.inject({
    method: 'POST',
    url: '/upload/initiate',
    payload: {
      redirect: '/quote/upload-received',
      s3Bucket: 'boundaries',
      s3Path: 'integration-test'
    }
  })

  expect(initiateRes.statusCode).toBe(statusCodes.ok)
  const { uploadId, uploadUrl } = JSON.parse(initiateRes.payload)

  // Upload file directly to CDP Uploader (using undici to bypass global fetch mock)
  const form = new FormData()
  const blob = new globalThis.Blob([fileBuffer], { type: 'application/json' })
  form.append('file', blob, filename)

  await undiciFetch(`${CDP_UPLOADER_URL}${uploadUrl}`, {
    method: 'POST',
    body: form,
    redirect: 'manual'
  })

  // Poll until status is 'ready'
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const statusRes = await server.inject({
      method: 'GET',
      url: `/upload/${uploadId}/status`
    })
    const { uploadStatus } = JSON.parse(statusRes.payload)
    if (uploadStatus === 'ready') {
      return uploadId
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(
    `Upload ${uploadId} did not become ready within ${POLL_TIMEOUT_MS}ms`
  )
}

describe('Boundary routes', () => {
  const getServer = setupTestServer()

  describe('POST /boundary/check/{uploadId}', () => {
    it('should return geojson on success', async () => {
      const mockGeojson = {
        type: 'FeatureCollection',
        features: []
      }

      vi.mocked(checkBoundary).mockResolvedValue({ geojson: mockGeojson })

      const testGeojson = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-1.5, 52.0] },
            properties: {}
          }
        ]
      })

      const uploadId = await uploadFileAndWaitUntilReady(
        getServer(),
        Buffer.from(testGeojson),
        'test-boundary.geojson'
      )

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body.type).toBe('FeatureCollection')

      expect(checkBoundary).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('test-boundary.geojson'),
        expect.any(String),
        { proj: undefined }
      )
    }, 30_000)

    it('should pass proj query parameter to impact assessor', async () => {
      const mockGeojson = {
        type: 'FeatureCollection',
        features: []
      }

      vi.mocked(checkBoundary).mockResolvedValue({ geojson: mockGeojson })

      const testGeojson = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-1.5, 52.0] },
            properties: {}
          }
        ]
      })

      const uploadId = await uploadFileAndWaitUntilReady(
        getServer(),
        Buffer.from(testGeojson),
        'test-boundary.geojson'
      )

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}?proj=EPSG:4326`
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(checkBoundary).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('test-boundary.geojson'),
        expect.any(String),
        { proj: 'EPSG:4326' }
      )
    }, 30_000)

    it('should return 404 when upload details have error', async () => {
      const nonExistentUploadId = 'f6b667d8-998f-4f55-8a20-204c0c289147'

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${nonExistentUploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.notFound)
    })

    it('should return 400 when upload is not ready', async () => {
      // Initiate upload but don't upload a file, so status stays 'initiated'
      const initiateRes = await getServer().inject({
        method: 'POST',
        url: '/upload/initiate',
        payload: {
          redirect: '/quote/upload-received',
          s3Bucket: 'boundaries',
          s3Path: 'integration-test'
        }
      })

      const { uploadId } = JSON.parse(initiateRes.payload)

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })

    it('should return error from impact assessor', async () => {
      vi.mocked(checkBoundary).mockResolvedValue({
        error: 'Unsupported file format',
        statusCode: statusCodes.badRequest
      })

      const uploadId = await uploadFileAndWaitUntilReady(
        getServer(),
        Buffer.from('not valid geometry'),
        'bad-file.txt'
      )

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('Unsupported file format')
    }, 30_000)

    it('should include geometry in error response when available', async () => {
      const mockGeometry = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Polygon' } }]
      }

      vi.mocked(checkBoundary).mockResolvedValue({
        error: 'Invalid geometry',
        statusCode: statusCodes.badRequest,
        geometry: mockGeometry
      })

      const uploadId = await uploadFileAndWaitUntilReady(
        getServer(),
        Buffer.from('test content'),
        'test.geojson'
      )

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('Invalid geometry')
      expect(body.geometry).toEqual(mockGeometry)
    }, 30_000)

    it('should default to 502 when impact assessor returns error without status code', async () => {
      vi.mocked(checkBoundary).mockResolvedValue({
        error: 'Service unavailable'
      })

      const uploadId = await uploadFileAndWaitUntilReady(
        getServer(),
        Buffer.from('test content'),
        'test.geojson'
      )

      const response = await getServer().inject({
        method: 'POST',
        url: `/boundary/check/${uploadId}`
      })

      expect(response.statusCode).toBe(statusCodes.badGateway)
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('Service unavailable')
    }, 30_000)

    it('should return 404 when no file info in upload details', async () => {
      vi.spyOn(cdpUploaderService, 'getUploadDetails').mockResolvedValue({
        uploadStatus: 'ready',
        form: {}
      })

      const response = await getServer().inject({
        method: 'POST',
        url: '/boundary/check/f6b667d8-998f-4f55-8a20-204c0c289147'
      })

      expect(response.statusCode).toBe(statusCodes.notFound)
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('No file found for this upload')

      vi.mocked(cdpUploaderService.getUploadDetails).mockRestore()
    })

    it('should return 502 when S3 download fails', async () => {
      vi.spyOn(cdpUploaderService, 'getUploadDetails').mockResolvedValue({
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
      vi.spyOn(s3Client, 'downloadFromS3').mockRejectedValue(
        new Error('S3 error')
      )

      const response = await getServer().inject({
        method: 'POST',
        url: '/boundary/check/f6b667d8-998f-4f55-8a20-204c0c289147'
      })

      expect(response.statusCode).toBe(statusCodes.badGateway)
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('Failed to retrieve uploaded file')

      vi.mocked(cdpUploaderService.getUploadDetails).mockRestore()
      vi.mocked(s3Client.downloadFromS3).mockRestore()
    })

    it('should fall back to config bucket when s3Bucket is not in upload details', async () => {
      const mockGeojson = { type: 'FeatureCollection', features: [] }
      vi.mocked(checkBoundary).mockResolvedValue({ geojson: mockGeojson })

      vi.spyOn(cdpUploaderService, 'getUploadDetails').mockResolvedValue({
        uploadStatus: 'ready',
        form: {
          file: {
            s3Key: 'uploads/test.geojson',
            filename: 'test.geojson',
            contentType: 'application/geo+json'
          }
        }
      })
      vi.spyOn(s3Client, 'downloadFromS3').mockResolvedValue({
        body: Buffer.from('{}'),
        contentType: 'application/geo+json',
        filename: 'test.geojson'
      })

      const response = await getServer().inject({
        method: 'POST',
        url: '/boundary/check/f6b667d8-998f-4f55-8a20-204c0c289147'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(s3Client.downloadFromS3).toHaveBeenCalledWith(
        'boundaries',
        'uploads/test.geojson'
      )

      vi.mocked(cdpUploaderService.getUploadDetails).mockRestore()
      vi.mocked(s3Client.downloadFromS3).mockRestore()
    })

    it('should fall back to S3 metadata for filename and contentType', async () => {
      const mockGeojson = { type: 'FeatureCollection', features: [] }
      vi.mocked(checkBoundary).mockResolvedValue({ geojson: mockGeojson })

      vi.spyOn(cdpUploaderService, 'getUploadDetails').mockResolvedValue({
        uploadStatus: 'ready',
        form: {
          file: {
            s3Key: 'uploads/test.geojson',
            s3Bucket: 'boundaries'
          }
        }
      })
      vi.spyOn(s3Client, 'downloadFromS3').mockResolvedValue({
        body: Buffer.from('{}'),
        contentType: 'application/geo+json',
        filename: 'test.geojson'
      })

      const response = await getServer().inject({
        method: 'POST',
        url: '/boundary/check/f6b667d8-998f-4f55-8a20-204c0c289147'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      expect(checkBoundary).toHaveBeenCalledWith(
        expect.any(Buffer),
        'test.geojson',
        'application/geo+json',
        { proj: undefined }
      )

      vi.mocked(cdpUploaderService.getUploadDetails).mockRestore()
      vi.mocked(s3Client.downloadFromS3).mockRestore()
    })
  })
})
