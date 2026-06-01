import { randomBytes } from 'node:crypto'
import { hashToken } from './hash-token.js'

export const generateToken = () => {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw) }
}
