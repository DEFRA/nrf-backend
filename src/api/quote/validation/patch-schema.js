import joi from 'joi'

const currencySchema = joi.number().precision(2).min(0).required()

const bandSchema = joi.number().integer().min(1).max(4).required()

const MAX_INTEGER = 2147483647

const dateSchema = joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)

const catchmentSchema = joi.object({
  label: joi.string().required(),
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
          edpName: joi.string().required(),
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
              modelVersion: joi.number().integer().min(1).required(),
              // Fields the impact assessor still sends but this
              // backend no longer records (edpType, the inflation index fields)
              // are accepted and ignored.
              calculationDate: joi.date().iso().required(),
              baseChargePerUnit: joi
                .number()
                .precision(2)
                .positive()
                .required(),
              units: joi.number().integer().min(1).max(MAX_INTEGER).required(),
              originalBaseAmount: currencySchema,
              originalBaseChargePerUnit: joi
                .number()
                .precision(2)
                .positive()
                .required()
            })
            .unknown()
            .required()
        })
        .unknown()
    )
    .required()
})
