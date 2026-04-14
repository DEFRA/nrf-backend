import axios from 'axios'
import { HttpsProxyAgent } from 'hpagent'
import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

export const createNotifyClient = () => {
  const apiKey = config.get('notify').apiKey
  if (!apiKey) {
    throw new Error('Notify API key is not set')
  }
  const notifyClient = new NotifyClient(apiKey)

  const proxyUrl = config.get('cdpHttpProxy')
  if (proxyUrl) {
    logger.info(`Using proxy: ${proxyUrl}`)
    const agent = new HttpsProxyAgent({ proxy: proxyUrl })
    notifyClient.setClient(
      axios.create({
        proxy: false,
        httpsAgent: agent
      })
    )
  } else {
    logger.error('cdpHttpProxy is not set')
  }
  return notifyClient
}
