import cron from 'node-cron'

import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { retryFailedQuoteEmails } from '../services/send-email/retry-failed-quote-emails.js'

const logger = createLogger()

/**
 * Schedules the failed-quote-email retry worker (NRF2-849). Disabled unless
 * `notify.emailRetry.enabled` is true, so dev/test stay quiet unless opted in.
 * Registered after the `postgres` plugin so `server.pg` is available.
 */
const notifyEmailRetry = {
  plugin: {
    name: 'notify-email-retry',
    register: (server) => {
      const emailRetry = config.get('notify.emailRetry')
      if (!emailRetry.enabled) {
        logger.info('Notify email retry worker is disabled')
        return
      }

      const task = cron.schedule(emailRetry.schedule, () => {
        retryFailedQuoteEmails({ pool: server.pg }).catch((error) =>
          logger.error(error, 'Notify email retry tick failed')
        )
      })

      server.ext('onPreStop', () => {
        task.stop()
      })

      logger.info(
        { schedule: emailRetry.schedule },
        'Notify email retry worker scheduled'
      )
    }
  }
}

export { notifyEmailRetry }
