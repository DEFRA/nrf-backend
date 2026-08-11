import cron from 'node-cron'

import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { pollNotifyEmailStatuses } from '../services/send-email/poll-notify-email-statuses.js'

const logger = createLogger()

/**
 * Schedules the GOV.UK Notify email-status poller. Disabled unless
 * `notify.statusPoller.enabled` is true, so dev/test stay quiet unless opted in.
 * Registered after the `postgres` plugin so `server.pg` is available.
 */
const notifyStatusPoller = {
  plugin: {
    name: 'notify-status-poller',
    register: (server) => {
      const poller = config.get('notify.statusPoller')
      if (!poller.enabled) {
        logger.info('Notify status poller is disabled')
        return
      }

      const task = cron.schedule(poller.schedule, () => {
        pollNotifyEmailStatuses({ pool: server.pg }).catch((error) =>
          logger.error(error, 'Notify status poll tick failed')
        )
      })

      server.ext('onPreStop', () => {
        task.stop()
      })

      logger.info(
        { schedule: poller.schedule },
        'Notify status poller scheduled'
      )
    }
  }
}

export { notifyStatusPoller }
