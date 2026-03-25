import { getCurrentISODateTime } from './date-time.js'

describe('getCurrentISODateTime', () => {
  it('should return the current date time as an ISO string', () => {
    const before = new Date()
    const result = getCurrentISODateTime()
    const after = new Date()

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(new Date(result).getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(new Date(result).getTime()).toBeLessThanOrEqual(after.getTime())
  })
})
