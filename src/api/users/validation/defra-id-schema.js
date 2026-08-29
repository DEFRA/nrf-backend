import joi from 'joi'

const MAX_DEFRA_ID_LENGTH = 255

// Matches users.defra_id VARCHAR(255)
export const defraIdSchema = joi
  .string()
  .trim()
  .max(MAX_DEFRA_ID_LENGTH)
  .pattern(/^\S+$/)

// The defra id is sent in a header (not the URL) so it never appears in access logs.
// unknown(true) lets the other request headers (host, user-agent, x-api-key, …) through.
export const defraIdHeaderSchema = joi
  .object({
    'x-defra-id': defraIdSchema.required()
  })
  .unknown(true)
