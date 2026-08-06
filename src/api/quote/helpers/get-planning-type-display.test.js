import { getPlanningTypeDisplay } from './get-planning-type-display.js'

describe('getPlanningTypeDisplay', () => {
  it.each([
    ['full-planning-permission', 'full planning permission'],
    ['outline-planning-permission', 'outline planning permission'],
    ['hybrid-planning-permission', 'hybrid planning permission']
  ])('maps %s to %s', (planningType, expected) => {
    expect(getPlanningTypeDisplay(planningType)).toBe(expected)
  })

  it('returns the raw value for an unknown planning type', () => {
    expect(getPlanningTypeDisplay('something-else')).toBe('something-else')
  })
})
