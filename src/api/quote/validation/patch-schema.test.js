import { patchSchema } from './patch-schema.js'

const validImpactMeasurement = {
  amount: 1.5,
  unit: 'mg/I TP',
  band: { min: 1, max: 2 }
}

const validEdp = {
  edpId: 1,
  edpName: 'Norfolk Fens east',
  edpStartDate: '2026-01-01',
  impact: {
    nitrogenTotal: validImpactMeasurement,
    phosphorusTotal: validImpactMeasurement
  },
  levyGbp: {
    amountExcludingVat: 10.0,
    amountInflationAdjusted: 10.0,
    baseAmount: 10.0,
    modelVersion: 1,
    calculationDate: '2026-09-14T10:30:15Z',
    originalBaseAmount: 10.0,
    baseChargePerUnit: 1.0,
    originalBaseChargePerUnit: 1.0,
    units: 10
  }
}

const validPayload = { edps: [validEdp] }

const validate = (payload) =>
  patchSchema.validate(payload, { abortEarly: false })

describe('patchSchema', () => {
  it('accepts a valid payload', () => {
    const { error } = validate(validPayload)
    expect(error).toBeUndefined()
  })

  describe('edps', () => {
    it('is required', () => {
      const { error } = validate({})
      expect(error).toBeDefined()
    })

    it('accepts multiple EDPs', () => {
      const { error } = validate({ edps: [validEdp, validEdp] })
      expect(error).toBeUndefined()
    })
  })

  describe('edpId', () => {
    it('is required', () => {
      const { edpId: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })

    it('must be an integer', () => {
      const { error } = validate({ edps: [{ ...validEdp, edpId: 1.5 }] })
      expect(error).toBeDefined()
    })
  })

  describe('edpName', () => {
    it('is required', () => {
      const { edpName: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })
  })

  describe('edpStartDate', () => {
    it('is required', () => {
      const { edpStartDate: _, ...rest } = validEdp
      expect(validate({ edps: [rest] }).error).toBeDefined()
    })

    it('must be a plain date', () => {
      const { error } = validate({
        edps: [{ ...validEdp, edpStartDate: '2026-01-01T00:00:00Z' }]
      })
      expect(error).toBeDefined()
    })
  })

  describe('impact', () => {
    it('is required', () => {
      const { impact: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })

    it('requires nitrogenTotal', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            impact: { phosphorusTotal: validImpactMeasurement }
          }
        ]
      })
      expect(error).toBeDefined()
    })

    it('requires phosphorusTotal', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            impact: { nitrogenTotal: validImpactMeasurement }
          }
        ]
      })
      expect(error).toBeDefined()
    })

    describe('impact measurement', () => {
      it('requires amount', () => {
        const { amount: _, ...rest } = validImpactMeasurement
        const { error } = validate({
          edps: [
            {
              ...validEdp,
              impact: {
                nitrogenTotal: rest,
                phosphorusTotal: validImpactMeasurement
              }
            }
          ]
        })
        expect(error).toBeDefined()
      })

      it('only accepts mg/I TP as unit', () => {
        const { error } = validate({
          edps: [
            {
              ...validEdp,
              impact: {
                nitrogenTotal: { ...validImpactMeasurement, unit: 'kg/ha' },
                phosphorusTotal: validImpactMeasurement
              }
            }
          ]
        })
        expect(error).toBeDefined()
      })

      it.each([
        ['outside the 1-4 range', { min: 1, max: 5 }],
        ['of 0', { min: 0, max: 1 }],
        ['that is not an integer', { min: 1.5, max: 2 }]
      ])('rejects a band %s', (_, band) => {
        const { error } = validate({
          edps: [
            {
              ...validEdp,
              impact: {
                nitrogenTotal: { ...validImpactMeasurement, band },
                phosphorusTotal: validImpactMeasurement
              }
            }
          ]
        })
        expect(error).toBeDefined()
      })
    })
  })

  describe('catchments', () => {
    const validCatchment = {
      label: 'Broads SAC',
      catchmentId: '27',
      catchmentOverlapPercentage: 67.4
    }

    it('accepts a list of catchments', () => {
      const { error } = validate({
        edps: [{ ...validEdp, catchments: [validCatchment] }]
      })
      expect(error).toBeUndefined()
    })

    it('is optional', () => {
      const { error } = validate({ edps: [validEdp] })
      expect(error).toBeUndefined()
    })

    it('accepts an empty list', () => {
      const { error } = validate({ edps: [{ ...validEdp, catchments: [] }] })
      expect(error).toBeUndefined()
    })

    it.each(['label', 'catchmentId', 'catchmentOverlapPercentage'])(
      'requires %s',
      (field) => {
        const { [field]: _, ...rest } = validCatchment
        const { error } = validate({
          edps: [{ ...validEdp, catchments: [rest] }]
        })
        expect(error).toBeDefined()
      }
    )

    it('accepts a null catchmentId', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            catchments: [{ ...validCatchment, catchmentId: null }]
          }
        ]
      })
      expect(error).toBeUndefined()
    })

    it('rejects an overlap percentage above 100', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            catchments: [{ ...validCatchment, catchmentOverlapPercentage: 101 }]
          }
        ]
      })
      expect(error).toBeDefined()
    })

    it('rejects a negative overlap percentage', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            catchments: [{ ...validCatchment, catchmentOverlapPercentage: -1 }]
          }
        ]
      })
      expect(error).toBeDefined()
    })
  })

  describe('levyGbp', () => {
    it('is required', () => {
      const { levyGbp: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })

    it.each([
      'amountExcludingVat',
      'amountInflationAdjusted',
      'baseAmount',
      'modelVersion'
    ])('requires %s', (field) => {
      const { [field]: _, ...rest } = validEdp.levyGbp
      const { error } = validate({
        edps: [{ ...validEdp, levyGbp: rest }]
      })
      expect(error).toBeDefined()
    })

    it('accepts decimal values to 2 places', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            levyGbp: { ...validEdp.levyGbp, amountExcludingVat: 10.55 }
          }
        ]
      })
      expect(error).toBeUndefined()
    })

    it('rejects negative values', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            levyGbp: { ...validEdp.levyGbp, amountExcludingVat: -1 }
          }
        ]
      })
      expect(error).toBeDefined()
    })

    it.each([1.5, 0, -1])('rejects a modelVersion of %s', (modelVersion) => {
      const { error } = validate({
        edps: [{ ...validEdp, levyGbp: { ...validEdp.levyGbp, modelVersion } }]
      })
      expect(error).toBeDefined()
    })
  })

  describe('levyGbp calculation history fields', () => {
    const history = {
      calculationDate: '2026-09-14T10:30:15Z',
      baseChargePerUnit: 2675,
      units: 10,
      originalBaseAmount: 26750,
      originalBaseChargePerUnit: 2675
    }
    const validateWith = (fields) =>
      validate({
        edps: [{ ...validEdp, levyGbp: { ...validEdp.levyGbp, ...fields } }]
      })

    it('accepts every field', () => {
      expect(validateWith(history).error).toBeUndefined()
    })

    it('accepts fields the backend no longer records', () => {
      const { error } = validateWith({
        ...history,
        edpStartYearIndexFactor: 1.0512
      })

      expect(error).toBeUndefined()
    })

    it.each([
      'calculationDate',
      'originalBaseAmount',
      'baseChargePerUnit',
      'originalBaseChargePerUnit',
      'units'
    ])('requires %s', (field) => {
      const { [field]: _, ...rest } = validEdp.levyGbp
      const { error } = validate({
        edps: [{ ...validEdp, levyGbp: rest }]
      })

      expect(error).toBeDefined()
    })

    it.each([
      ['calculationDate', 'yesterday'],
      ['baseChargePerUnit', 0],
      ['units', 0],
      ['units', 2147483648],
      ['originalBaseAmount', -1],
      ['originalBaseChargePerUnit', 0]
    ])('rejects %s of %s', (field, value) => {
      expect(validateWith({ ...history, [field]: value }).error).toBeDefined()
    })
  })
})
