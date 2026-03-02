import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'

export const createNotifyClient = () => {
  const apiKey = config.get('notify').apiKey
  if (!apiKey) {
    throw new Error('Notify API key is not set')
  }
  return new NotifyClient(apiKey)
}
