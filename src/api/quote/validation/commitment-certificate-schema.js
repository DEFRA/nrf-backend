import joi from 'joi'

export const commitmentCertificateSchema = joi.object({
  createCommitmentCertificate: joi.boolean().valid(true).required()
})
