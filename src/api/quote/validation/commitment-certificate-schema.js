import joi from 'joi'

const MAX_INTEGER = 2147483647

// The levy calculation the impact assessor returned for the user's request to
// use, relayed by the frontend. It has the fields of a quote results callback's
// levyGbp, under the names the impact assessor's recalculate endpoint uses.
// Fields the backend no longer records (the inflation index fields) are
// accepted and ignored.
export const levyCalculationSchema = joi
  .object({
    calculationDate: joi.date().iso().required(),
    provisionalAmount: joi.number().precision(2).min(0).required(),
    inflationAdjustedAmount: joi.number().precision(2).min(0).required(),
    baseChargePerUnit: joi.number().precision(2).positive().required(),
    calculatorVersion: joi.number().integer().min(1).required(),
    units: joi.number().integer().min(1).max(MAX_INTEGER).required(),
    originalBaseAmount: joi.number().precision(2).min(0).required(),
    originalBaseChargePerUnit: joi.number().precision(2).positive().required()
  })
  .unknown()

export const commitmentCertificateSchema = joi.object({
  createCommitmentCertificate: joi.boolean().valid(true).required(),
  levy: levyCalculationSchema.required()
})
