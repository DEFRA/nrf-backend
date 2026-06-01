import { hashToken } from './hash-token.js'

describe('hashToken', () => {
  it('returns the SHA-256 hex digest of the input', () => {
    // SHA-256 of "abc"
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('is deterministic for the same input', () => {
    expect(hashToken('some-token')).toBe(hashToken('some-token'))
  })

  it('returns a 64-character hex string', () => {
    const hash = hashToken('any-value')

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
  })
})
