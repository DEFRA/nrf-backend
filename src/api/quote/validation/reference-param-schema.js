import joi from 'joi'

export const referenceParamSchema = joi.object({
  reference: joi
    .string()
    .pattern(/^NRL-\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'REFERENCE_INVALID',
      'any.required': 'REFERENCE_REQUIRED'
    })
})
