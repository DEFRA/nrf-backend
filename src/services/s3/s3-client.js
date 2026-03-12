import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

let client

function getS3Client() {
  if (!client) {
    const options = {
      region: config.get('s3.region')
    }

    const endpoint = config.get('s3.endpoint')
    if (endpoint) {
      options.endpoint = endpoint
      options.forcePathStyle = config.get('s3.forcePathStyle')
    }

    client = new S3Client(options)
  }
  return client
}

/**
 * Download a file from S3
 * @param {string} bucket - S3 bucket name
 * @param {string} key - S3 object key
 * @returns {Promise<{body: Buffer, contentType: string, filename: string}>}
 */
export async function downloadFromS3(bucket, key) {
  logger.info(`Downloading from S3 - bucket: ${bucket}, key: ${key}`)

  const s3 = getS3Client()
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  const response = await s3.send(command)

  const chunks = []
  for await (const chunk of response.Body) {
    chunks.push(chunk)
  }

  const filename = key.split('/').pop()

  return {
    body: Buffer.concat(chunks),
    contentType: response.ContentType,
    filename
  }
}
