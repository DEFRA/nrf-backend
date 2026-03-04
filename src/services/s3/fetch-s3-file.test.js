import { GetObjectCommand } from '@aws-sdk/client-s3'

import { fetchS3File, fetchS3FileAsBuffer } from './fetch-s3-file.js'
import { getS3Client } from './s3-client.js'

vi.mock('@aws-sdk/client-s3')
vi.mock('./s3-client.js')

describe('fetchS3File', () => {
  const mockSend = vi.fn()

  beforeEach(() => {
    vi.mocked(getS3Client).mockReturnValue({ send: mockSend })
  })

  it('should fetch file from S3 and return contents as string', async () => {
    mockSend.mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue('file-content')
      }
    })

    const result = await fetchS3File('uploads/test-file.json')

    expect(result).toBe('file-content')
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: '',
      Key: 'uploads/test-file.json'
    })
    expect(mockSend).toHaveBeenCalled()
  })

  it('should throw when S3 returns an error', async () => {
    mockSend.mockRejectedValue(new Error('NoSuchKey'))

    await expect(fetchS3File('missing-file.json')).rejects.toThrow('NoSuchKey')
  })
})

describe('fetchS3FileAsBuffer', () => {
  const mockSend = vi.fn()

  beforeEach(() => {
    vi.mocked(getS3Client).mockReturnValue({ send: mockSend })
  })

  it('should fetch file from S3 and return contents as Buffer', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    mockSend.mockResolvedValue({
      Body: {
        transformToByteArray: vi.fn().mockResolvedValue(bytes)
      }
    })

    const result = await fetchS3FileAsBuffer('uploads/test-file.zip')

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result).toEqual(Buffer.from([1, 2, 3]))
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: '',
      Key: 'uploads/test-file.zip'
    })
  })

  it('should throw when S3 returns an error', async () => {
    mockSend.mockRejectedValue(new Error('NoSuchKey'))

    await expect(fetchS3FileAsBuffer('missing-file.zip')).rejects.toThrow(
      'NoSuchKey'
    )
  })
})
