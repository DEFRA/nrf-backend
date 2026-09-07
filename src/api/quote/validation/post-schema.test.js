import { quoteSchema } from './post-schema.js'
import { validQuotePayload } from '../../../test-utils/fixtures/quotePayloads.js'

const validPayload = {
  planningType: 'full-planning-permission',
  boundaryEntryType: 'draw',
  boundaryGeojson: { type: 'Feature', geometry: {} },
  housingUnits: 10,
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

  describe('boundaryGeojson.intersectingEdps', () => {
    const withEdps = (intersectingEdps) => ({
      ...validPayload,
      boundaryGeojson: { ...validPayload.boundaryGeojson, intersectingEdps }
    })

    it('accepts a full boundary check response, overlap measures and all', () => {
      const { error } = validate(validQuotePayload)
      expect(error).toBeUndefined()
    })

    it('is optional', () => {
      const { error } = validate(validPayload)
      expect(error).toBeUndefined()
    })

    it('defaults a missing catchments array to empty', () => {
      const { error, value } = validate(withEdps([{ label: 'River Wensum' }]))
      expect(error).toBeUndefined()
      expect(value.boundaryGeojson.intersectingEdps[0].catchments).toEqual([])
    })

    it('rejects an EDP label longer than the edp_name column', () => {
      const { error } = validate(withEdps([{ label: 'x'.repeat(256) }]))
      expect(error).toBeDefined()
    })

    it('accepts an EDP whose label the assessor could not resolve', () => {
      const { error } = validate(withEdps([{ label: null }]))
      expect(error).toBeUndefined()
    })

    it('rejects an EDP with no label', () => {
      const { error } = validate(withEdps([{ overlapAreaHa: 1.5 }]))
      expect(error).toBeDefined()
    })

    it('rejects a catchment overlap percentage above 100', () => {
      const { error } = validate(
        withEdps([
          {
            label: 'River Wensum',
            catchments: [
              { label: 'Broads SAC', catchmentOverlapPercentage: 101 }
            ]
          }
        ])
      )
      expect(error).toBeDefined()
    })
  })

  describe('boundaryFilename', () => {
    it('is optional', () => {
      const { error } = validate(validPayload)
      expect(error).toBeUndefined()
    })

    it('accepts a .shp filename', () => {
      const { error } = validate({
        ...validPayload,
        boundaryEntryType: 'upload',
        boundaryFilename: 'site-boundary.shp'
      })
      expect(error).toBeUndefined()
    })

    it('accepts null', () => {
      const { error } = validate({
        ...validPayload,
        boundaryFilename: null
      })
      expect(error).toBeUndefined()
    })

    it('rejects a filename longer than 255 characters', () => {
      const { error } = validate({
        ...validPayload,
        boundaryFilename: `${'a'.repeat(252)}.shp`
      })
      expect(error).toBeDefined()
    })

    it.each([
      '<script>alert(1)</script>.shp',
      'boundary"><img src=x onerror=alert(1)>.shp',
      "boundary';DROP TABLE quotes;--.shp",
      'boundary`whoami`.shp',
      'boundary\nINFO fake log.shp'
    ])('rejects hostile filename %j', (hostile) => {
      const { error } = validate({
        ...validPayload,
        boundaryEntryType: 'upload',
        boundaryFilename: hostile
      })
      expect(error).toBeDefined()
    })

    it('strips a path-traversal payload down to its harmless basename', () => {
      const { error, value } = validate({
        ...validPayload,
        boundaryEntryType: 'upload',
        boundaryFilename: '../../etc/passwd.shp'
      })
      expect(error).toBeUndefined()
      expect(value.boundaryFilename).toBe('passwd.shp')
    })
  })

  describe('housingUnits', () => {
    it('is required', () => {
      const { housingUnits: _, ...rest } = validPayload
      const { error } = validate(rest)
      expect(error).toBeDefined()
    })

    it('must be at least 1', () => {
      const { error } = validate({
        ...validPayload,
        housingUnits: 0
      })
      expect(error).toBeDefined()
    })

    it('must not exceed 999999', () => {
      const { error } = validate({
        ...validPayload,
        housingUnits: 1000000
      })
      expect(error).toBeDefined()
    })

    it('must be an integer', () => {
      const { error } = validate({
        ...validPayload,
        housingUnits: 1.5
      })
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
      const local = 'a'.repeat(10)
      const domain = `${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(49)}.co`
      const email = `${local}@${domain}`
      expect(email.length).toBe(255)
      const { error } = validate({ ...validPayload, email })
      expect(error).toBeDefined()
    })

    it('accepts an email at the 254 character boundary', () => {
      const local = 'a'.repeat(10)
      const domain = `${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(48)}.co`
      const email = `${local}@${domain}`
      expect(email.length).toBe(254)
      const { error } = validate({ ...validPayload, email })
      expect(error).toBeUndefined()
    })
  })
})
