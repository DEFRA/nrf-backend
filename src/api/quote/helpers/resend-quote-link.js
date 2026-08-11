import { config } from '../../../config.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import { generateToken } from '../../../common/helpers/token/generate-token.js'
import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { dbUpdateQuoteWithEmailSent } from '../../../services/db/quotes/update-quote-with-email-sent.js'
import { dbCreateEmailNotification } from '../../../services/db/quote-email-notifications/create-email-notification.js'
import { sendQuoteEmail } from './send-quote-email.js'
import { buildQuoteAccessLink } from './build-quote-access-link.js'

const logger = createLogger()

/**
 * Issues a fresh access token for a quote and emails the new access link to
 * the quote owner. Issuing the token invalidates any still-live token, so the
 * previous link stops working as soon as a new one is sent.
 *
 * `sendQuoteEmail` resolves to `null` when Notify rejects the send, so the
 * boolean return lets callers avoid reporting a delivery that never happened.
 *
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {{ id: number, reference: string, planningType: string, housingUnits: number, email: { address: string }, edps: object[] }} params.quote
 * @returns {Promise<boolean>} whether Notify accepted the email
 */
export const resendQuoteLink = async ({ db, quote }) => {
  const { raw, hash } = generateToken()

  await dbIssueQuoteAccessToken({ db, quoteId: quote.id, tokenHash: hash })

  const quoteAccessLink = buildQuoteAccessLink({
    reference: quote.reference,
    rawToken: raw
  })

  const emailResult = await sendQuoteEmail({
    recipientEmailAddress: quote.email.address,
    nrfQuoteReference: quote.reference,
    nrfServiceUrl: config.get('frontEndBaseUrl'),
    edps: quote.edps,
    housingUnits: quote.housingUnits,
    planningType: quote.planningType,
    quoteAccessLink
  })

  // The email was accepted by Notify. The post-send writes below track it for
  // the admin UI and the status poller; both are best-effort. A throw here must
  // not escape: on the resend-unknown path it would leak a 500-vs-200
  // enumeration oracle, and on the resend-known path it would surface a server
  // error for an email that was actually sent. Log and continue either way.
  if (emailResult?.sentDateTime) {
    // Advance the send timestamp so the admin "date sent" tracks this resend,
    // matching the latest notification row the quote mapper surfaces (#7).
    try {
      await dbUpdateQuoteWithEmailSent({
        db,
        reference: quote.reference,
        data: { emailSendRequestAt: emailResult.sentDateTime }
      })
    } catch (error) {
      logger.error(
        { quoteId: quote.id, error },
        'Failed to record resend timestamp; email was sent'
      )
    }
  }

  if (emailResult?.notificationId) {
    try {
      await dbCreateEmailNotification({
        db,
        quoteId: quote.id,
        notificationId: emailResult.notificationId,
        emailType: 'resend'
      })
    } catch (error) {
      logger.error(
        {
          quoteId: quote.id,
          notificationId: emailResult.notificationId,
          error
        },
        'Failed to record Notify notification id; email was sent'
      )
    }
  }

  return Boolean(emailResult?.sentDateTime)
}
