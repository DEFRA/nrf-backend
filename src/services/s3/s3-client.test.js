import { Readable } from 'node:stream'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockSend
  },
  GetObjectCommand: class {
    constructor(params) {
      this.params = params
    }
  }
}))

const { downloadFromS3 } = await import('./s3-client.js')

describe('s3-client', () => {
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
