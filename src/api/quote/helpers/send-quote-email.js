import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'
import { getDevelopmentDescription } from './get-development-description.js'
import { getLevyAmount } from './get-levy-amount.js'

export const sendQuoteEmail = ({
  recipientEmailAddress,
  nrfQuoteReference,
  edps,
  development,
  wasteWaterTreatmentWorks
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
      wasteWaterTreatmentWorks: wasteWaterTreatmentWorks.join(', '),
      levyAmount: getLevyAmount(edps),
      adminAmount: '£TBC',
      nrfServiceUrl: config.get('frontEndBaseUrl')
    },
    templateId: templateIds.quote
  })
}
