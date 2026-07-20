import Wreck from '@hapi/wreck'

import { config } from '../../config.js'

vi.mock('@hapi/wreck', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}))

vi.mock('@defra/hapi-tracing', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    withTraceId: vi.fn((_, headers = {}) => ({
      ...headers,
      'x-cdp-request-id': 'trace-test-id'
    }))
  }
})

const { getCdpUploaderUrl, initiateUpload, getUploadStatus, getUploadDetails } =
  await import('./cdp-uploader.js')

describe('getCdpUploaderUrl', () => {
  const originalEnv = process.env.ENVIRONMENT

  afterEach(() => {
    process.env.ENVIRONMENT = originalEnv
  })

  it('should return explicit URL from config when set', () => {
    vi.spyOn(config, 'get').mockReturnValue(
      'https://custom-uploader.example.com'
    )

    expect(getCdpUploaderUrl()).toBe('https://custom-uploader.example.com')
  })

  it('should derive URL from ENVIRONMENT when config is not set', () => {
    vi.spyOn(config, 'get').mockReturnValue(null)
    process.env.ENVIRONMENT = 'dev'

    expect(getCdpUploaderUrl()).toBe(
      'https://cdp-uploader.dev.cdp-int.defra.cloud'
    )
  })

  it('should return localhost fallback when no config or environment', () => {
    vi.spyOn(config, 'get').mockReturnValue(null)
    delete process.env.ENVIRONMENT

    expect(getCdpUploaderUrl()).toBe('http://localhost:7337')
  })
})

describe('initiateUpload', () => {
  beforeEach(() => {
    vi.spyOn(config, 'get').mockReturnValue(null)
    delete process.env.ENVIRONMENT
  })

  it('should return uploadId and extract path from full uploadUrl', async () => {
    vi.mocked(Wreck.post).mockResolvedValue({
      payload: {
        uploadId: 'abc-123',
        uploadUrl: 'http://localhost:7337/upload/abc-123'
      }
    })

    const result = await initiateUpload({
      redirect: 'http://localhost:3000/done',
      s3Bucket: 'my-bucket',
      s3Path: 'uploads'
    })

    expect(result).toEqual({
      uploadId: 'abc-123',
      uploadUrl: '/upload/abc-123'
    })

    expect(Wreck.post).toHaveBeenCalledWith(
      'http://localhost:7337/initiate',
      expect.objectContaining({
        payload: JSON.stringify({
          redirect: 'http://localhost:3000/done',
          s3Bucket: 'my-bucket',
          s3Path: 'uploads',
          metadata: undefined
        }),
        headers: {
          'Content-Type': 'application/json',
          'x-cdp-request-id': 'trace-test-id'
        },
        json: true
      })
    )
  })

  it('should include maxFileSize in the payload when provided', async () => {
    vi.mocked(Wreck.post).mockResolvedValue({
      payload: {
        uploadId: 'abc-123',
        uploadUrl: '/upload/abc-123'
      }
    })

    await initiateUpload({
      redirect: 'http://localhost:3000/done',
      s3Bucket: 'my-bucket',
      maxFileSize: 2 * 1024 * 1024
    })

    const sentPayload = JSON.parse(
      vi.mocked(Wreck.post).mock.calls[0][1].payload
    )
    expect(sentPayload.maxFileSize).toBe(2 * 1024 * 1024)
  })

  it('should return uploadUrl as-is when it is a relative path', async () => {
    vi.mocked(Wreck.post).mockResolvedValue({
      payload: {
        uploadId: 'abc-123',
        uploadUrl: '/upload/abc-123'
      }
    })

    const result = await initiateUpload({
      redirect: 'http://localhost:3000/done',
      s3Bucket: 'my-bucket'
    })

    expect(result.uploadUrl).toBe('/upload/abc-123')
  })

  it('should return error when Wreck.post throws', async () => {
    vi.mocked(Wreck.post).mockRejectedValue(new Error('Connection refused'))

    const result = await initiateUpload({
      redirect: 'http://localhost:3000/done',
      s3Bucket: 'my-bucket'
    })

    expect(result).toEqual({ error: 'Unable to initiate upload' })
  })
})

describe('getUploadStatus', () => {
  beforeEach(() => {
    vi.spyOn(config, 'get').mockReturnValue(null)
    delete process.env.ENVIRONMENT
  })

  it('should return uploadStatus from the response', async () => {
    vi.mocked(Wreck.get).mockResolvedValue({
      payload: { uploadStatus: 'ready' }
    })

    const result = await getUploadStatus('abc-123')

    expect(result).toEqual({ uploadStatus: 'ready' })
    expect(Wreck.get).toHaveBeenCalledWith(
      'http://localhost:7337/status/abc-123',
      {
        json: true,
        headers: { 'x-cdp-request-id': 'trace-test-id' }
      }
    )
  })

  it('should return unknown when uploadStatus is missing', async () => {
    vi.mocked(Wreck.get).mockResolvedValue({
      payload: {}
    })

    const result = await getUploadStatus('abc-123')

    expect(result).toEqual({ uploadStatus: 'unknown' })
  })

  it('should return error status when Wreck.get throws', async () => {
    vi.mocked(Wreck.get).mockRejectedValue(new Error('Connection refused'))

    const result = await getUploadStatus('abc-123')

    expect(result).toEqual({
      uploadStatus: 'error',
      error: 'Unable to check upload status'
    })
  })
})

describe('getUploadDetails', () => {
  beforeEach(() => {
    vi.spyOn(config, 'get').mockReturnValue(null)
    delete process.env.ENVIRONMENT
  })

  it('should return the full payload from the uploader', async () => {
    const mockPayload = {
      uploadStatus: 'ready',
      form: {
        file: {
          s3Key: 'uploads/test.geojson',
          s3Bucket: 'boundaries',
          filename: 'test.geojson',
          contentType: 'application/geo+json'
        }
      }
    }

    vi.mocked(Wreck.get).mockResolvedValue({ payload: mockPayload })

    const result = await getUploadDetails('abc-123')

    expect(result).toEqual(mockPayload)
    expect(Wreck.get).toHaveBeenCalledWith(
      'http://localhost:7337/status/abc-123',
      {
        json: true,
        headers: {
          'x-cdp-request-id': 'trace-test-id'
        }
      }
    )
  })

  it('should return error with status code when Wreck.get throws', async () => {
    const error = new Error('Not Found')
    error.output = { statusCode: 404 }
    vi.mocked(Wreck.get).mockRejectedValue(error)

    const result = await getUploadDetails('abc-123')

    expect(result).toEqual({
      uploadStatus: 'error',
      error: 'upload_status_check_failed',
      statusCode: 404
    })
  })

  it('should return undefined status code when error has no output', async () => {
    vi.mocked(Wreck.get).mockRejectedValue(new Error('Connection refused'))

    const result = await getUploadDetails('abc-123')

    expect(result).toEqual({
      uploadStatus: 'error',
      error: 'upload_status_check_failed',
      statusCode: undefined
    })
  })
})
