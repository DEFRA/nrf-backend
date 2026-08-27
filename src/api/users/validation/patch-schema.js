import joi from 'joi'
import { relationshipTypes } from '../../../common/constants/relationship-types.js'

const MAX_NAME_LENGTH = 255
const MAX_EMAIL_LENGTH = 254
const MAX_DEFRA_ID_LENGTH = 255

export const userPatchSchema = joi
  .object({
    // Defra ID sub claim; kept in the body (not the URL) so it never appears in access logs.
    // Matches users.defra_id VARCHAR(255)
    defraId: joi
      .string()
      .trim()
      .max(MAX_DEFRA_ID_LENGTH)
      .pattern(/^\S+$/)
      .required(),
    email: joi
      .string()
      .trim()
      .max(MAX_EMAIL_LENGTH)
      .pattern(/^\S*$/)
      .email({ tlds: { allow: false } })
      .required(),
    firstName: joi.string().trim().max(MAX_NAME_LENGTH).required(),
    lastName: joi.string().trim().max(MAX_NAME_LENGTH).required(),
    organisationDefraId: joi
      .string()
      .trim()
      .max(MAX_DEFRA_ID_LENGTH)
      .pattern(/^\S+$/)
      .optional(),
    organisationName: joi.string().trim().max(MAX_NAME_LENGTH).optional(),
    relationshipType: joi
      .string()
      .valid(...Object.values(relationshipTypes))
      .optional()
  })
  // organisations.name is NOT NULL, so the name must come with the id
  .with('organisationDefraId', ['organisationName'])
  // A relationship type only exists on a user/organisation link, so it needs an org id
  .with('relationshipType', ['organisationDefraId'])
