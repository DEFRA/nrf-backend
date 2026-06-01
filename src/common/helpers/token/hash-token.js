import { createHash } from 'node:crypto'

export const hashToken = (raw) => createHash('sha256').update(raw).digest('hex')
