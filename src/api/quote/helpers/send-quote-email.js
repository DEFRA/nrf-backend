import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'
import { getLevyAmount } from './get-levy-amount.js'

/**
 * @param {object} params
 * @param {string} params.recipientEmailAddress
 * @param {string} params.nrfQuoteReference
 * @param {string} params.nrfServiceUrl
 * @param {Array<{edpName: string, levyGbp: {min: number, max: number}}>} params.edps
 * @param {number} params.residentialBuildingCount
 * @param {string} params.planningType
 * @param {string} params.quoteAccessLink
 */
export const sendQuoteEmail = ({
  recipientEmailAddress,
  nrfQuoteReference,
  nrfServiceUrl,
  edps,
  residentialBuildingCount,
  planningType,
  quoteAccessLink
}) => {
  const { templateIds } = config.get('notify')
  return sendEmail({
    recipientEmailAddress,
    emailReference: nrfQuoteReference,
    emailBodyVariables: {
      nrfQuoteReference,
      edpNames: edps.map(({ edpName }) => edpName),
      residentialBuildingCount,
      planningType,
      levyAmount: getLevyAmount(edps),
      nrfServiceUrl,
      quoteAccessLink
    },
    templateId: templateIds.quote
  })
}
