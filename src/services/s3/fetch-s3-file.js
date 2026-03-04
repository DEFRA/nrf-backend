import { GetObjectCommand } from '@aws-sdk/client-s3'

import { config } from '../../config.js'
import { getS3Client } from './s3-client.js'

export const fetchS3File = async (fileKey) => {
  const client = getS3Client()
  const bucketName = config.get('s3.bucketName')

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: fileKey
  })

  const response = await client.send(command)
  return await response.Body.transformToString()
}

export const fetchS3FileAsBuffer = async (fileKey) => {
  const client = getS3Client()
  const bucketName = config.get('s3.bucketName')

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: fileKey
  })

  const response = await client.send(command)
  const bytes = await response.Body.transformToByteArray()
  return Buffer.from(bytes)
}
