import cron from 'node-cron'

import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { pollNotifyEmailStatuses } from '../services/send-email/poll-notify-email-statuses.js'
import { retryFailedQuoteEmails } from '../services/send-email/retry-failed-quote-emails.js'

const logger = createLogger()

/**
 * Schedules a single combined job (NRF2-849) that, on each tick:
 *   1. Polls GOV.UK Notify for delivery-status updates on pending notifications
 *   2. Re-sends any quote emails that came back as retryable failures
 *
 * Disabled unless `notify.retrySendingEmails.enabled` is true so dev/test stay
 * quiet unless opted in. Registered after the `postgres` plugin so `server.pg`
 * is available.
 */
const notifyWorker = {
  plugin: {
    name: 'notify-worker',
    register: (server) => {
      const { enabled, schedule } = config.get('notify.retrySendingEmails')
      if (!enabled) {
        logger.info('Notify worker is disabled')
        return
      }

      const tick = () => {
        pollNotifyEmailStatuses({ pool: server.pg })
          .then(() => retryFailedQuoteEmails({ pool: server.pg }))
          .catch((error) => logger.error(error, 'Notify worker tick failed'))
      }

      const task = cron.schedule(schedule, tick)

      // node-cron v4 removed runOnInit — fire the first tick immediately
      tick()

      server.ext('onPreStop', () => {
        task.stop()
      })

      logger.info({ schedule }, 'Notify worker scheduled')
    }
  }
}

export { notifyWorker }
