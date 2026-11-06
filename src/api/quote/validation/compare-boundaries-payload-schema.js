import joi from 'joi'
import { referencePattern } from '@defra/nrf-library'

export const compareBoundariesPayloadSchema = joi.object({
  originalReference: joi
    .string()
    .pattern(new RegExp(`^${referencePattern.source}$`))
    .required(),
  currentBoundaryGeoJson: joi
    .object({ type: joi.string().required() })
    .unknown(true)
    .required()
})
