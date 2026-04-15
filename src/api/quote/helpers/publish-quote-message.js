import { publishEvent } from '../../../services/sns/publish-event.js'
import { config } from '../../../config.js'

export const publishQuoteMessage = ({ quoteData, logger }) => {
  return publishEvent(
    {
      topicArn: config.get('sns.topic.nrfQuoteEstimateRequest.arn'),
      data: {
        reference: quoteData.reference,
        boundaryGeojson: quoteData.boundaryGeojson,
        developmentTypes: quoteData.developmentTypes,
        residentialBuildingCount: quoteData.residentialBuildingCount,
        peopleCount: quoteData.peopleCount,
        wasteWaterTreatmentWorksId: quoteData.wasteWaterTreatmentWorksId
      }
    },
    logger
  )
}
