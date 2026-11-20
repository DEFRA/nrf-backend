import joi from 'joi'
import {
  currencySchema,
  levyCalculationFields,
  modelVersionSchema
} from './levy-calculation-fields.js'

const bandSchema = joi.number().integer().min(1).max(4).required()

const MAX_NAME_LENGTH = 255

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Shape alone lets 2026-99-99 through to fail the DATE insert as a 500, so
// the value must also round-trip through Date unchanged.
const dateSchema = joi
  .string()
  .pattern(ISO_DATE_PATTERN)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00Z`)
    const isRealDate =
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    return isRealDate ? value : helpers.error('any.invalid')
  })

const catchmentSchema = joi.object({
  label: joi.string().max(MAX_NAME_LENGTH).required(),
  catchmentId: joi.string().required().allow(null),
  catchmentOverlapPercentage: joi.number().min(0).max(100).required()
})

const impactMeasurementSchema = joi.object({
  amount: joi.number().precision(2).required(),
  unit: joi.string().valid('mg/I TP').required(),
  band: joi.object({
    min: bandSchema,
    max: bandSchema
  })
})

export const patchSchema = joi.object({
  edps: joi
    .array()
    .items(
      joi
        .object({
          edpId: joi.number().integer().required(),
          edpName: joi.string().max(MAX_NAME_LENGTH).required(),
          edpStartDate: dateSchema.required(),
          impact: joi
            .object({
              nitrogenTotal: impactMeasurementSchema.required(),
              phosphorusTotal: impactMeasurementSchema.required()
            })
            .required(),
          // Optional while the impact assessor rolls out catchments; make it
          // required once every callback sends them.
          catchments: joi.array().items(catchmentSchema),
          levyGbp: joi
            .object({
              amountExcludingVat: currencySchema,
              amountInflationAdjusted: currencySchema,
              baseAmount: currencySchema,
              modelVersion: modelVersionSchema,
              // Fields the impact assessor still sends but this
              // backend no longer records (edpType, the inflation index fields)
              // are accepted and ignored.
              ...levyCalculationFields
            })
            .unknown()
            .required()
        })
        .unknown()
    )
    .required()
})
