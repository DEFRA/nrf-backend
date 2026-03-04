import { S3Client } from '@aws-sdk/client-s3'

import { config } from '../../config.js'

export const getS3Client = () => {
  const { endpoint, forcePathStyle } = config.get('s3')

  return new S3Client({
    ...(endpoint && { endpoint }),
    forcePathStyle
  })
}
