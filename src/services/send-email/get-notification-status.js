import { retryAsyncOperation } from '@defra/nrf-library'

import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { createNotifyClient } from './notify-client.js'

const logger = createLogger()

/**
 * Fetch the current delivery status of a GOV.UK Notify notification by its id.
 * Each individual call is wrapped in a retry (reusing the send path's notify
 * retry config) so a transient Notify blip doesn't drop a status update.
 *
 * @param {string} notificationId - GOV.UK Notify notification UUID
 * @returns {Promise<{ status: string, sentAt: string|null, completedAt: string|null }>}
 */
export const getNotificationStatus = async (notificationId) => {
  const notifyClient = createNotifyClient()
  const { retryAttempts, retryIntervalMs } = config.get('notify')

  return retryAsyncOperation({
    operation: async () => {
      const { data } = await notifyClient.getNotificationById(notificationId)
      return {
        status: data.status,
        sentAt: data.sent_at ?? null,
        completedAt: data.completed_at ?? null
      }
    },
    retries: retryAttempts,
    intervalMs: retryIntervalMs,
    logger
  })
}
