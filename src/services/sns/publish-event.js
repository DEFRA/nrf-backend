import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import { config } from '../../config.js'

const snsClient = new SNSClient({
  region: config.get('aws.region'),
  endpoint: config.get('sns.endpoint')
})

export async function publishEvent(
  { topicArn, data },
  logger,
  client = snsClient
) {
  try {
    await client.send(
      new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(data)
      })
    )
    logger?.info?.(
      `Published event to SNS topic: ${topicArn} data: ${JSON.stringify(data, null, 2)}`
    )
    return true
  } catch (error) {
    logger?.error?.(
      {
        error: error?.message,
        code: error?.name,
        stack: error?.stack
      },
      `Failed to publish event to SNS topic: ${topicArn}`
    )
    throw error
  }
}

/** @import { Request } from '@hapi/hapi' */
