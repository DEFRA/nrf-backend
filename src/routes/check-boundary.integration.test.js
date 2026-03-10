import crypto from 'node:crypto'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3'
import { setupTestServer } from '../test-utils/setup-test-server.js'

const s3Client = new S3Client({
  region: 'eu-west-2',
  endpoint: 'http://localhost:4567',
  forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
})

const BUCKET = 'boundaries'

const validGeojson = JSON.stringify({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-1.0, 51.0],
        [-1.0, 52.0],
        [0.0, 52.0],
        [0.0, 51.0],
        [-1.0, 51.0]
      ]
    ]
  },
  properties: {}
})

describe('Check boundary routes (integration)', () => {
  const getServer = setupTestServer()

  describe('POST /quote/check-boundary/{id}', () => {
    it('should return 422 when the boundary file does not exist', async () => {
      const nonExistentId = crypto.randomUUID()

      const response = await getServer().inject({
        method: 'POST',
        url: `/quote/check-boundary/${nonExistentId}`
      })

      expect(response.statusCode).toBe(422)
      const body = JSON.parse(response.payload)
      expect(body.message).toContain('No boundary file found')
    })

    it('should return 200 when a valid boundary file exists in S3', async () => {
      const uploadId = crypto.randomUUID()
      const s3Key = `${uploadId}/boundary.geojson`

      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key,
          Body: validGeojson,
          ContentType: 'application/geo+json'
        })
      )

      try {
        const assessorResult = { valid: true, area_hectares: 12.5 }
        global.fetchMock.mockResponseOnce(JSON.stringify(assessorResult))

        const response = await getServer().inject({
          method: 'POST',
          url: `/quote/check-boundary/${uploadId}`
        })

        expect(response.statusCode).toBe(200)
        const body = JSON.parse(response.payload)
        expect(body).toEqual(assessorResult)
      } finally {
        await s3Client.send(
          new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key })
        )
      }
    })
  })
})
