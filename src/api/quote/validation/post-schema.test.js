import { quoteSchema } from './post-schema.js'

const validPayload = {
  boundaryEntryType: 'draw',
  boundaryGeojson: { type: 'Feature', geometry: {} },
  developmentTypes: ['housing'],
  residentialBuildingCount: 10,
  wasteWaterTreatmentWorks: 'Great Billing WRC',
  email: 'developer@housebuilder.com'
}

const validate = (payload) =>
  quoteSchema.validate(payload, { abortEarly: false })

describe('quoteSchema', () => {
  describe('boundaryEntryType', () => {
    it('accepts draw', () => {
      const { error } = validate(validPayload)
      expect(error).toBeUndefined()
    })

    it('accepts upload', () => {
      const { error } = validate({
        ...validPayload,
        boundaryEntryType: 'upload'
      })
      expect(error).toBeUndefined()
    })

    it('rejects an invalid value', () => {
      const { error } = validate({
        ...validPayload,
        boundaryEntryType: 'sketch'
      })
      expect(error).toBeDefined()
    })

    it('is required', () => {
      const { boundaryEntryType: _, ...rest } = validPayload
      const { error } = validate(rest)
      expect(error).toBeDefined()
    })
  })

  describe('boundaryGeojson', () => {
    it('is required', () => {
      const { boundaryGeojson: _, ...rest } = validPayload
      const { error } = validate(rest)
      expect(error).toBeDefined()
    })

    it('must be an object', () => {
      const { error } = validate({
        ...validPayload,
        boundaryGeojson: 'not-an-object'
      })
      expect(error).toBeDefined()
    })

    it('accepts a valid object', () => {
      const { error } = validate(validPayload)
      expect(error).toBeUndefined()
    })
  })

  describe('developmentTypes', () => {
    it('accepts housing', () => {
      const { error } = validate(validPayload)
      expect(error).toBeUndefined()
    })

    it('accepts other-residential', () => {
      const { error } = validate({
        ...validPayload,
        developmentTypes: ['other-residential'],
        residentialBuildingCount: undefined,
        peopleCount: 5
      })
      expect(error).toBeUndefined()
    })

    it('accepts both types together', () => {
      const { error } = validate({
        ...validPayload,
        developmentTypes: ['housing', 'other-residential'],
        peopleCount: 5
      })
      expect(error).toBeUndefined()
    })

    it('rejects an invalid type', () => {
      const { error } = validate({
        ...validPayload,
        developmentTypes: ['commercial']
      })
      expect(error).toBeDefined()
    })

    it('is required', () => {
      const { developmentTypes: _, ...rest } = validPayload
      const { error } = validate(rest)
      expect(error).toBeDefined()
    })
  })

  describe('residentialBuildingCount', () => {
    it('is required when developmentTypes includes housing', () => {
      const { residentialBuildingCount: _, ...rest } = validPayload
      const { error } = validate(rest)
      expect(error).toBeDefined()
    })

    it('must be at least 1', () => {
      const { error } = validate({
        ...validPayload,
        residentialBuildingCount: 0
      })
      expect(error).toBeDefined()
    })

    it('must not exceed 999999', () => {
      const { error } = validate({
        ...validPayload,
        residentialBuildingCount: 1000000
      })
      expect(error).toBeDefined()
    })

    it('must be an integer', () => {
      const { error } = validate({
        ...validPayload,
        residentialBuildingCount: 1.5
      })
      expect(error).toBeDefined()
    })

    it('errors if sent when developmentTypes does not include housing', () => {
      const { error } = validate({
        ...validPayload,
        developmentTypes: ['other-residential'],
        residentialBuildingCount: 10,
        peopleCount: 5
      })
      expect(error).toBeDefined()
    })
  })

  describe('peopleCount', () => {
    it('is required when developmentTypes includes other-residential', () => {
      const { error } = validate({
        ...validPayload,
        developmentTypes: ['other-residential'],
        residentialBuildingCount: undefined
      })
      expect(error).toBeDefined()
    })

    it('must be at least 1', () => {
      const { error } = validate({
        ...validPayload,
        developmentTypes: ['other-residential'],
        residentialBuildingCount: undefined,
        peopleCount: 0
      })
      expect(error).toBeDefined()
    })

    it('must be an integer', () => {
      const { error } = validate({
        ...validPayload,
        developmentTypes: ['other-residential'],
        residentialBuildingCount: undefined,
        peopleCount: 2.5
      })
      expect(error).toBeDefined()
    })

    it('errors if sent when developmentTypes does not include other-residential', () => {
      const { error } = validate({ ...validPayload, peopleCount: 5 })
      expect(error).toBeDefined()
    })
  })

  describe('email', () => {
    it('is required', () => {
      const { email: _, ...rest } = validPayload
      const { error } = validate(rest)
      expect(error).toBeDefined()
    })

    it('rejects an invalid email', () => {
      const { error } = validate({ ...validPayload, email: 'not-an-email' })
      expect(error).toBeDefined()
    })

    it('rejects an email with whitespace', () => {
      const { error } = validate({
        ...validPayload,
        email: 'user @example.com'
      })
      expect(error).toBeDefined()
    })

    it('rejects an email exceeding 254 characters', () => {
      // local(64) + @(1) + domain(190) = 255 — one over the limit
      // domain: 63 + 1 + 63 + 1 + 63 + 1 + 58 + 1 + 2 = 253... build carefully
      // Use .co (2-char tld) so Joi accepts it; 63.63.61.co = 63+1+63+1+61+1+2 = 192, total = 257 — trim down
      // Simplest: local(10) + @(1) + domain(244) = 255
      const local = 'a'.repeat(10)
      // domain of 244 chars: 63.63.63.52.co = 63+1+63+1+63+1+52+1+2 = 247 — adjust
      // 63+1+63+1+63+1+49+1+2 = 244
      const domain = `${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(49)}.co`
      const email = `${local}@${domain}` // 10 + 1 + 244 = 255
      expect(email.length).toBe(255)
      const { error } = validate({ ...validPayload, email })
      expect(error).toBeDefined()
    })

    it('accepts an email at the 254 character boundary', () => {
      // Joi enforces RFC 5321's 254-char total limit via its email validator
      // local(10) + @(1) + domain(243) = 254
      // 63+1+63+1+63+1+48+1+2 = 243
      const local = 'a'.repeat(10)
      const domain = `${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(48)}.co`
      const email = `${local}@${domain}` // 10 + 1 + 243 = 254
      expect(email.length).toBe(254)
      const { error } = validate({ ...validPayload, email })
      expect(error).toBeUndefined()
    })
  })
})
