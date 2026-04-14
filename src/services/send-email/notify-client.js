import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

export const createNotifyClient = () => {
  const apiKey = config.get('notify').apiKey
  if (!apiKey) {
    throw new Error('Notify API key is not set')
  }
  logger.info('HTTP_PROXY: ', process.env.HTTP_PROXY)
  const notifyClient = new NotifyClient(apiKey)

  return notifyClient
}
