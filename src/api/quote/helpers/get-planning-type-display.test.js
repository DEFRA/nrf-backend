import { getPlanningTypeDisplay } from './get-planning-type-display.js'

describe('getPlanningTypeDisplay', () => {
  it.each([
    ['full-planning-permission', 'Full planning permission'],
    ['outline-planning-permission', 'Outline planning permission'],
    ['hybrid-planning-permission', 'Hybrid planning permission']
  ])('maps %s to %s', (planningType, expected) => {
    expect(getPlanningTypeDisplay(planningType)).toBe(expected)
  })

  it('returns the raw value for an unknown planning type', () => {
    expect(getPlanningTypeDisplay('something-else')).toBe('something-else')
  })
})
