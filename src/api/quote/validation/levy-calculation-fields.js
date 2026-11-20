import joi from 'joi'

const MAX_INTEGER = 2147483647

export const currencySchema = joi.number().precision(2).min(0).required()

export const modelVersionSchema = joi.number().integer().min(1).required()

export const levyCalculationFields = {
  calculationDate: joi.date().iso().required(),
  baseChargePerUnit: joi.number().precision(2).positive().required(),
  units: joi.number().integer().min(1).max(MAX_INTEGER).required(),
  originalBaseAmount: currencySchema,
  originalBaseChargePerUnit: joi.number().precision(2).positive().required()
}
