import joi from 'joi'

import { validateSafeFilename } from '../../../common/helpers/safe-filename.js'

const MAX_RESIDENTIAL_UNITS = 999999
const MAX_EMAIL_LENGTH = 254

const MAX_BOUNDARY_FILENAME_LENGTH = 255

// Re-run the shared safe-filename rule as a joi custom validator so that
// POST /quotes enforces *exactly* the same allowlist as the upload path.
// This closes the gap where a client could POST directly to this endpoint
// with a hostile filename that never went through zip/upload validation.
const safeBoundaryFilename = (value, helpers) => {
  const result = validateSafeFilename(value)
  if (!result.ok) {
    return helpers.error('any.invalid')
  }
  return result.filename
}

const MAX_EDP_LABEL_LENGTH = 255
const MAX_PERCENTAGE = 100

// .unknown(true) is required, not stylistic: joi rejects unknown keys unless
// stripUnknown is configured, and the server sets only abortEarly — so a
// closed schema would 400 every boundary-check field we do not persist.
const intersectingEdpSchema = joi
  .object({
    label: joi.string().max(MAX_EDP_LABEL_LENGTH).allow(null).required(),
    catchments: joi
      .array()
      .items(
        joi
          .object({
            label: joi.string().max(MAX_EDP_LABEL_LENGTH).required(),
            catchmentOverlapPercentage: joi
              .number()
              .min(0)
              .max(MAX_PERCENTAGE)
              .required()
          })
          .unknown(true)
      )
      .default([])
  })
  .unknown(true)

export const quoteSchema = joi.object({
  planningType: joi
    .string()
    .valid(
      'full-planning-permission',
      'outline-planning-permission',
      'hybrid-planning-permission',
      'other'
    )
    .required(),
  boundaryEntryType: joi.string().valid('draw', 'upload').required(),
  boundaryGeojson: joi
    .object({
      intersectingEdps: joi.array().items(intersectingEdpSchema).optional()
    })
    .unknown(true)
    .required(),
  // Present for 'upload' entries (the inner .shp for zips, or the uploaded
  // filename for standalone geojson/kml); absent for 'draw' entries. Every
  // character is re-validated against the shared safe-filename allowlist to
  // stop hostile names reaching the DB even if the client bypasses the
  // upload flow.
  boundaryFilename: joi
    .string()
    .trim()
    .max(MAX_BOUNDARY_FILENAME_LENGTH)
    .custom(safeBoundaryFilename, 'safe boundary filename')
    .optional()
    .allow(null),
  housingUnits: joi
    .number()
    .integer()
    .min(1)
    .max(MAX_RESIDENTIAL_UNITS)
    .required(),
  email: joi
    .string()
    .trim()
    .max(MAX_EMAIL_LENGTH)
    .pattern(/^\S*$/)
    .email({ tlds: { allow: false } })
    .required(),
  disableAnalyticsAudit: joi.boolean().optional()
})
