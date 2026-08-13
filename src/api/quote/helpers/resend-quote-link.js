import { config } from '../../../config.js'
import { generateToken } from '../../../common/helpers/token/generate-token.js'
import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { sendQuoteEmail } from './send-quote-email.js'
import { buildQuoteAccessLink } from './build-quote-access-link.js'

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
    db,
    quoteId: quote.id,
    emailType: 'resend',
    recipientEmailAddress: quote.email.address,
    nrfQuoteReference: quote.reference,
    nrfServiceUrl: config.get('frontEndBaseUrl'),
    edps: quote.edps,
    housingUnits: quote.housingUnits,
    planningType: quote.planningType,
    quoteAccessLink
  })

  return Boolean(emailResult?.sentDateTime)
}
