import { createLogger } from '../../../common/helpers/logging/logger.js'
import { EMAIL_TYPE_QUOTE_RESULTS } from '../../../common/constants/email-type.js'

/**
 * Persist a GOV.UK Notify notification id against a quote so its delivery
 * status can be polled later. One row per email lifecycle — the initial
 * quote_result send, or a user-initiated resend — retries update the existing
 * row in place rather than inserting a new one. `ON CONFLICT DO NOTHING` makes
 * this safe to re-issue for the same notification id.
 *
 * The initial send's attempt row is written in the same statement, so a
 * lifecycle row can never exist without its first attempt (and a conflict skip
 * cannot orphan one).
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {string|null} params.notificationId - GOV.UK Notify notification UUID, or null when Notify rejected the send
 * @param {import('../../../common/constants/email-type.js').EmailType} [params.emailType=EMAIL_TYPE_QUOTE_RESULTS]
 */
export const dbCreateEmailNotification = async ({
  db,
  quoteId,
  notificationId,
  emailType = EMAIL_TYPE_QUOTE_RESULTS
}) => {
  const logger = createLogger()

  await db.query(
    `WITH inserted AS (
       INSERT INTO quote_email_notifications (quote_id, notification_id, email_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (notification_id) DO NOTHING
       RETURNING id
     )
     INSERT INTO quote_email_notification_attempts (email_notification_id, attempt_no, notification_id)
     SELECT id, 1, $2 FROM inserted`,
    [quoteId, notificationId, emailType]
  )

  logger.info(
    { quoteId, notificationId, emailType },
    'Email notification recorded'
  )
}
