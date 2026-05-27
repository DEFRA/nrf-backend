import { createHash } from 'node:crypto'
import { generateToken } from './generate-token.js'

describe('generateToken', () => {
  it('returns a raw token and its SHA-256 hash', () => {
    const { raw, hash } = generateToken()

    const expectedHash = createHash('sha256').update(raw).digest('hex')
    expect(hash).toBe(expectedHash)
  })

  it('returns a base64url-encoded raw token of ~43 characters', () => {
    const { raw } = generateToken()

    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(raw.length).toBe(43)
  })

  it('returns a hex-encoded SHA-256 hash of 64 characters', () => {
    const { hash } = generateToken()

    expect(hash).toMatch(/^[a-f0-9]+$/)
    expect(hash.length).toBe(64)
  })

  it('generates unique tokens on each call', () => {
    const first = generateToken()
    const second = generateToken()

    expect(first.raw).not.toBe(second.raw)
    expect(first.hash).not.toBe(second.hash)
  })
})
