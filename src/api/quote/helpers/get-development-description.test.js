import { getDevelopmentDescription } from './get-development-description.js'

describe('getDevelopmentDescription', () => {
  it('returns housing and other-residential description when both types present', () => {
    const development = {
      types: ['housing', 'other-residential'],
      residentialBuildingCount: 6,
      peopleCount: 80
    }
    expect(getDevelopmentDescription(development)).toBe(
      'Housing with 6 residential units and a development with a maximum number of 80 people'
    )
  })

  it('returns housing-only description when only housing type present', () => {
    const development = {
      types: ['housing'],
      residentialBuildingCount: 5,
      peopleCount: null
    }
    expect(getDevelopmentDescription(development)).toBe(
      'Housing with a total of 5 residential units'
    )
  })

  it('returns other-residential-only description when only other-residential type present', () => {
    const development = {
      types: ['other-residential'],
      residentialBuildingCount: null,
      peopleCount: 80
    }
    expect(getDevelopmentDescription(development)).toBe(
      'A development with a maximum number of 80 people'
    )
  })

  it('uses singular "unit" when residentialBuildingCount is 1', () => {
    const development = {
      types: ['housing'],
      residentialBuildingCount: 1,
      peopleCount: null
    }
    expect(getDevelopmentDescription(development)).toBe(
      'Housing with a total of 1 residential unit'
    )
  })
})
