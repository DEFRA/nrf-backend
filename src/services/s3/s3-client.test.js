import { Readable } from 'node:stream'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      constructor(options) {
        this.options = options
      }

      send = mockSend
    },
    GetObjectCommand: class MockGetObjectCommand {
      constructor(params) {
        this.params = params
      }
    }
  }
})

const { downloadFromS3 } = await import('./s3-client.js')

describe('s3-client', () => {
  afterEach(() => {
    mockSend.mockReset()
  })

  describe('downloadFromS3', () => {
    it('should download and return file buffer', async () => {
      const fileContent = Buffer.from('file content here')
      const stream = Readable.from([fileContent])

      mockSend.mockResolvedValue({
        Body: stream,
        ContentType: 'application/geo+json'
      })

      const result = await downloadFromS3('boundaries', 'uploads/test.geojson')

      expect(result.body).toEqual(fileContent)
      expect(result.contentType).toBe('application/geo+json')
      expect(result.filename).toBe('test.geojson')
    })

    it('should extract filename from S3 key', async () => {
      const stream = Readable.from([Buffer.from('data')])
      mockSend.mockResolvedValue({
        Body: stream,
        ContentType: 'application/octet-stream'
      })

      const result = await downloadFromS3('boundaries', 'path/to/boundary.shp')

      expect(result.filename).toBe('boundary.shp')
    })
  })
})

describe('s3-client with endpoint configured', () => {
  it('should pass endpoint and forcePathStyle to S3Client', async () => {
    vi.resetModules()

    const localMockSend = vi.fn().mockResolvedValue({
      Body: Readable.from([Buffer.from('data')]),
      ContentType: 'application/octet-stream'
    })

    let capturedOptions

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client: class {
        constructor(options) {
          capturedOptions = options
        }

        send = localMockSend
      },
      GetObjectCommand: class {
        constructor(params) {
          this.params = params
        }
      }
    }))

    vi.doMock('../../config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            's3.region': 'eu-west-2',
            's3.endpoint': 'http://localhost:4566',
            's3.forcePathStyle': true,
            log: {
              isEnabled: false,
              level: 'silent',
              format: 'pino-pretty',
              redact: []
            },
            serviceName: 'nrf-backend',
            serviceVersion: null
          }
          return values[key]
        })
      }
    }))

    const { downloadFromS3: downloadWithEndpoint } =
      await import('./s3-client.js')

    await downloadWithEndpoint('boundaries', 'uploads/test.geojson')

    expect(capturedOptions).toEqual({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true
    })
  })
})
