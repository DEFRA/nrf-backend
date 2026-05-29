import { getLevyAmount } from './get-levy-amount.js'

describe('getLevyAmount', () => {
  it('returns a range when min and max differ', () => {
    const edps = [
      { levyGbp: { min: '1000.00', max: '2000.00' } },
      { levyGbp: { min: '500.00', max: '1500.00' } }
    ]
    expect(getLevyAmount(edps)).toBe('£1500 - £3500')
  })

  it('returns a single value when min equals max', () => {
    const edps = [
      { levyGbp: { min: '1000.00', max: '1000.00' } },
      { levyGbp: { min: '500.00', max: '500.00' } }
    ]
    expect(getLevyAmount(edps)).toBe('£1500')
  })

  it('handles a single edp', () => {
    const edps = [{ levyGbp: { min: '200.00', max: '400.00' } }]
    expect(getLevyAmount(edps)).toBe('£200 - £400')
  })

  it('handles decimal values', () => {
    const edps = [
      { levyGbp: { min: '999.00', max: '999.00' } },
      { levyGbp: { min: '500.50', max: '1500.75' } }
    ]
    expect(getLevyAmount(edps)).toBe('£1499.5 - £2499.75')
  })
})
