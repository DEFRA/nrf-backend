import joi from 'joi'

const MAX_DEFRA_ID_LENGTH = 255

export const defraIdParamSchema = joi.object({
  // Defra ID sub claim; opaque identifier, not PII. Matches users.defra_id VARCHAR(255)
  defraId: joi
    .string()
    .trim()
    .max(MAX_DEFRA_ID_LENGTH)
    .pattern(/^\S+$/)
    .required()
})
