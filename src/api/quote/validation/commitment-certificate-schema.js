import joi from 'joi'
import {
  currencySchema,
  levyCalculationFields,
  modelVersionSchema
} from './levy-calculation-fields.js'

// The levy calculation the impact assessor returned for the user's request to
// use, relayed by the frontend. It has the fields of a quote results callback's
// levyGbp, under the names the impact assessor's recalculate endpoint uses.
// Fields the backend no longer records (the inflation index fields) are
// accepted and ignored.
export const levyCalculationSchema = joi
  .object({
    ...levyCalculationFields,
    provisionalAmount: currencySchema,
    inflationAdjustedAmount: currencySchema,
    calculatorVersion: modelVersionSchema
  })
  .unknown()

export const commitmentCertificateSchema = joi.object({
  createCommitmentCertificate: joi.boolean().valid(true).required(),
  levy: levyCalculationSchema.required()
})
