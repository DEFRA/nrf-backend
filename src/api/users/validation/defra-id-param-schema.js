import joi from 'joi'

const MAX_DEFRA_ID_LENGTH = 255

// Matches users.defra_id VARCHAR(255)
export const defraIdSchema = joi
  .string()
  .trim()
  .max(MAX_DEFRA_ID_LENGTH)
  .pattern(/^\S+$/)

export const defraIdParamSchema = joi.object({
  defraId: defraIdSchema.required()
})
