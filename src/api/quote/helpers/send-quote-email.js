import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'

export const sendQuoteEmail = ({
  recipientEmailAddress,
  nrfQuoteReference
}) => {
  const { templateIds } = config.get('notify')
  return sendEmail({
    recipientEmailAddress,
    emailReference: nrfQuoteReference,
    emailBodyVariables: {
      estimateReference: nrfQuoteReference,
      levyAmount: '£3500',
      monitoringAmount: '£250',
      maintenanceAmount: '£560',
      adminAmount: '£80'
    },
    templateId: templateIds.quote
  })
}
