import joi from 'joi'
import { referencePattern } from '@defra/nrf-library'

// TLD allow-list disabled so backend email validation matches the frontend's.
export const emailQuoteLinkPayloadSchema = joi.object({
  reference: joi
    .string()
    .pattern(new RegExp(`^${referencePattern.source}$`))
    .required(),
  email: joi
    .string()
    .email({ tlds: { allow: false } })
    .max(256)
    .required()
})
