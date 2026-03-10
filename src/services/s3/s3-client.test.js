import { downloadBoundaryFile } from './s3-client.js'

const mockSend = vi.hoisted(() => vi.fn())

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor() {
      this.send = mockSend
    }
  },
  ListObjectsV2Command: class {},
  GetObjectCommand: class {}
}))

describe('downloadBoundaryFile', () => {
  const uploadId = 'f6b667d8-998f-4f55-8a20-204c0c289147'

  it('should download the first file from the upload prefix', async () => {
    const fileContent = Buffer.from('test file content')

    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: `${uploadId}/boundary.geojson` }]
    })
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(fileContent) },
      ContentType: 'application/geo+json'
    })

    const result = await downloadBoundaryFile(uploadId)

    expect(result).toEqual({
      buffer: fileContent,
      filename: 'boundary.geojson',
      contentType: 'application/geo+json'
    })

    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('should throw when no files found for the upload', async () => {
    mockSend.mockResolvedValueOnce({ Contents: [] })

    await expect(downloadBoundaryFile(uploadId)).rejects.toThrow(
      `No boundary file found for upload ${uploadId}`
    )
  })

  it('should throw when Contents is undefined', async () => {
    mockSend.mockResolvedValueOnce({})

    await expect(downloadBoundaryFile(uploadId)).rejects.toThrow(
      `No boundary file found for upload ${uploadId}`
    )
  })
})
