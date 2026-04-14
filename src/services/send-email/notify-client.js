import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
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

  const proxyUrl = config.get('httpProxy')
  if (proxyUrl) {
    logger.info(`Using proxy: ${proxyUrl}`)
    notifyClient.setClient(
      axios.create({ httpsAgent: new HttpsProxyAgent(proxyUrl), proxy: false })
    )
  } else {
    logger.error('httpProxy is not set')
  }

  return notifyClient
}
