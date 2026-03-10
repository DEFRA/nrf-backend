import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand
} from '@aws-sdk/client-s3'
import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

const BOUNDARY_BUCKET = 'boundaries'

function createS3Client() {
  const endpoint = config.get('s3.endpoint')
  const forcePathStyle = config.get('s3.forcePathStyle')
  const region = config.get('s3.region')

  const options = { region }
  if (endpoint) {
    options.endpoint = endpoint
    options.forcePathStyle = forcePathStyle
  }

  return new S3Client(options)
}

export async function downloadBoundaryFile(uploadId) {
  const client = createS3Client()

  const listResponse = await client.send(
    new ListObjectsV2Command({
      Bucket: BOUNDARY_BUCKET,
      Prefix: `${uploadId}/`
    })
  )

  const objects = listResponse.Contents
  if (!objects || objects.length === 0) {
    logger.error(`No files found in S3 for uploadId: ${uploadId}`)
    throw new Error(`No boundary file found for upload ${uploadId}`)
  }

  const objectKey = objects[0].Key
  const getResponse = await client.send(
    new GetObjectCommand({
      Bucket: BOUNDARY_BUCKET,
      Key: objectKey
    })
  )

  const bodyBytes = await getResponse.Body.transformToByteArray()
  const filename = objectKey.split('/').pop()

  return {
    buffer: Buffer.from(bodyBytes),
    filename,
    contentType: getResponse.ContentType
  }
}
