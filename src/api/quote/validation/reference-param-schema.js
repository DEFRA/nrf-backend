import joi from 'joi'

import { referencePattern } from '@defra/nrf-library'

export const referenceParamSchema = joi.object({
  reference: joi
    .string()
    .pattern(new RegExp(`^${referencePattern.source}$`))
    .required()
    .messages({
      'string.pattern.base': 'REFERENCE_INVALID',
      'any.required': 'REFERENCE_REQUIRED'
    })
})
