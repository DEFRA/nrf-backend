import { getLevyAmount } from './get-levy-amount.js'

describe('getLevyAmount', () => {
  it('returns a range when min and max differ', () => {
    const edps = [
      { levyGbp: { min: 1000, max: 2000 } },
      { levyGbp: { min: 500, max: 1500 } }
    ]
    expect(getLevyAmount(edps)).toBe('£1500 - £3500')
  })

  it('returns the total without £ prefix when min equals max', () => {
    const edps = [
      { levyGbp: { min: 1000, max: 1000 } },
      { levyGbp: { min: 500, max: 500 } }
    ]
    expect(getLevyAmount(edps)).toBe('1500')
  })

  it('handles a single edp', () => {
    const edps = [{ levyGbp: { min: 200, max: 400 } }]
    expect(getLevyAmount(edps)).toBe('£200 - £400')
  })
})
