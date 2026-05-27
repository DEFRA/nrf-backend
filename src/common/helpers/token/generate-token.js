import { randomBytes, createHash } from 'node:crypto'

export const generateToken = () => {
  const raw = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}
