import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'

import { createNotifyClient } from '../services/send-email/notify-client.js'

// A fresh UUID per send: the id is stored in a UNIQUE column, so a fixed one would collide across quotes
export const mockNotifyClient = () => {
  const sendEmail = vi
    .fn()
    .mockImplementation(async () => ({ data: { id: randomUUID() } }))
  vi.mocked(createNotifyClient).mockReturnValue({ sendEmail })
  return sendEmail
}
