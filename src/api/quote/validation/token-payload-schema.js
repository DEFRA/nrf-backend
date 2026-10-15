import joi from 'joi'

export const tokenPayloadSchema = joi.object({
  token: joi.string().max(256).required()
})
