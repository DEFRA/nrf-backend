import joi from 'joi'

const MAX_RESIDENTIAL_UNITS = 999999
const MAX_EMAIL_LENGTH = 254

export const quoteSchema = joi.object({
  boundaryEntryType: joi.string().valid('draw', 'upload').required(),
  boundaryGeojson: joi.object().required(),
  developmentTypes: joi
    .array()
    .items(joi.string().valid('housing', 'other-residential'))
    .required(),
  residentialBuildingCount: joi.when('developmentTypes', {
    is: joi.array().has(joi.valid('housing')),
    then: joi.number().integer().min(1).max(MAX_RESIDENTIAL_UNITS).required(),
    otherwise: joi.any().forbidden()
  }),
  peopleCount: joi.when('developmentTypes', {
    is: joi.array().has(joi.valid('other-residential')),
    then: joi.number().integer().min(1).required(),
    otherwise: joi.any().forbidden()
  }),
  wasteWaterTreatmentWorks: joi.string().required(),
  email: joi
    .string()
    .trim()
    .max(MAX_EMAIL_LENGTH)
    .pattern(/^\S*$/)
    .email({ tlds: { allow: false } })
    .required()
})
