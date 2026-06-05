import { maskEmail } from './mask-email.js'

describe('maskEmail', () => {
  it('keeps the first three characters of the local part and the full domain', () => {
    expect(maskEmail('adeola@example.com')).toBe('ade**@example.com')
  })

  it('masks a local part of exactly three characters', () => {
    expect(maskEmail('abc@example.com')).toBe('abc**@example.com')
  })

  it('keeps a local part shorter than three characters as-is', () => {
    expect(maskEmail('ab@example.com')).toBe('ab**@example.com')
    expect(maskEmail('a@example.com')).toBe('a**@example.com')
  })

  it('preserves the full domain including subdomains', () => {
    expect(maskEmail('person@mail.example.co.uk')).toBe(
      'per**@mail.example.co.uk'
    )
  })
})
