import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'
import { getDevelopmentDescription } from './get-development-description.js'
import { getLevyAmount } from './get-levy-amount.js'

/**
 * @param {object} params
 * @param {string} params.recipientEmailAddress
 * @param {string} params.nrfQuoteReference
 * @param {string} params.nrfServiceUrl
 * @param {Array<{edpName: string, levyGbp: {min: number, max: number}}>} params.edps
 * @param {{types: string[], residentialBuildingCount: number, peopleCount: number}} params.development
 * @param {string} params.wasteWaterTreatmentWorks
 * @param {string} params.quoteAccessLink
 */
export const sendQuoteEmail = ({
  recipientEmailAddress,
  nrfQuoteReference,
  nrfServiceUrl,
  edps,
  development,
  wasteWaterTreatmentWorks,
  quoteAccessLink
}) => {
  const { templateIds } = config.get('notify')
  const developmentDescription = getDevelopmentDescription(development)
  return sendEmail({
    recipientEmailAddress,
    emailReference: nrfQuoteReference,
    emailBodyVariables: {
      nrfQuoteReference,
      edpNames: edps.map(({ edpName }) => edpName).join(', '),
      developmentDescription,
      wasteWaterTreatmentWorks,
      levyAmount: getLevyAmount(edps),
      nrfServiceUrl,
      quoteAccessLink
    },
    templateId: templateIds.quote
  })
}
