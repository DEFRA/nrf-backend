import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'
import { getLevyAmount } from './get-levy-amount.js'
import { getPlanningTypeDisplay } from './get-planning-type-display.js'
import { formatCurrency } from '../../../common/helpers/format-currency.js'

/**
 * Send a quote result email via GOV.UK Notify. Recording the notification id
 * against the quote is the caller's responsibility: initial sends and
 * user-initiated resends insert a new quote_email_notifications row; the retry
 * worker updates the existing row for that quote's email lifecycle. Keeping
 * persistence out of here means one helper is not tied to one persistence
 * shape.
 *
 * @param {object} params
 * @param {string} params.recipientEmailAddress
 * @param {string} params.nrfQuoteReference
 * @param {string} [params.emailReference=nrfQuoteReference] - Notify dedup/reference key for the send; retries pass a suffixed value so a re-send can never be deduplicated against an earlier attempt
 * @param {string} params.nrfServiceUrl
 * @param {Array<{edpName: string, levyGbp: {amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number}}>} params.edps
 * @param {number} params.housingUnits
 * @param {string} params.planningType
 * @param {string} params.quoteAccessLink
 * @returns {Promise<{ notificationId: string, sentDateTime: string } | null>} - null if Notify rejected the send
 */
export const sendQuoteEmail = async ({
  recipientEmailAddress,
  nrfQuoteReference,
  emailReference = nrfQuoteReference,
  nrfServiceUrl,
  edps,
  housingUnits,
  planningType,
  quoteAccessLink
}) => {
  const { templateIds } = config.get('notify')
  const { levyAmountExcludingVat, levyAmountInflationAdjusted } =
    getLevyAmount(edps)
  return sendEmail({
    recipientEmailAddress,
    emailReference,
    emailBodyVariables: {
      nrfQuoteReference,
      edpNames: edps.map(({ edpName }) => edpName).join(', '),
      housingUnits,
      planningType: getPlanningTypeDisplay(planningType),
      levyAmount: formatCurrency(levyAmountExcludingVat),
      levyAmountInflationAdjusted: formatCurrency(levyAmountInflationAdjusted),
      nrfServiceUrl,
      quoteAccessLink
    },
    templateId: templateIds.quote
  })
}
