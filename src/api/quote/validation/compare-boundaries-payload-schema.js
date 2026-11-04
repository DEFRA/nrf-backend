import joi from 'joi'
import { referencePattern } from '@defra/nrf-library'

const referenceField = joi
  .string()
  .pattern(new RegExp(`^${referencePattern.source}$`))
  .required()

export const compareBoundariesPayloadSchema = joi.object({
  originalReference: referenceField,
  currentReference: referenceField
})
