import cron from 'node-cron'
import { notifyEmailRetry } from './notify-email-retry.js'
import { retryFailedQuoteEmails } from '../services/send-email/retry-failed-quote-emails.js'

vi.mock('node-cron')
vi.mock('../config.js', () => ({
  config: {
    get: vi.fn()
  }
}))
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn()
}))
vi.mock('../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}))
vi.mock('../services/send-email/retry-failed-quote-emails.js')

import { config } from '../config.js'

const makeServer = () => {
  const extHandlers = {}
  return {
    pg: {},
    ext: vi.fn((event, fn) => {
      extHandlers[event] = fn
    }),
    extHandlers
  }
}

describe('notifyEmailRetry plugin', () => {
  beforeEach(() => {
    vi.mocked(retryFailedQuoteEmails).mockResolvedValue(undefined)
  })

  it('does not schedule when disabled', () => {
    config.get.mockReturnValue({ enabled: false, schedule: '*/15 * * * *' })
    const server = makeServer()

    notifyEmailRetry.plugin.register(server)

    expect(cron.schedule).not.toHaveBeenCalled()
    expect(server.ext).not.toHaveBeenCalled()
  })

  it('schedules on the configured cron expression and stops the task on shutdown', () => {
    const stop = vi.fn()
    vi.mocked(cron.schedule).mockReturnValue({ stop })
    config.get.mockReturnValue({ enabled: true, schedule: '*/15 * * * *' })
    const server = makeServer()

    notifyEmailRetry.plugin.register(server)

    expect(cron.schedule).toHaveBeenCalledWith(
      '*/15 * * * *',
      expect.any(Function)
    )
    server.extHandlers.onPreStop()
    expect(stop).toHaveBeenCalled()
  })

  it('invokes the retry worker with server.pg on each tick', async () => {
    vi.mocked(cron.schedule).mockReturnValue({ stop: vi.fn() })
    config.get.mockReturnValue({ enabled: true, schedule: '*/15 * * * *' })
    const server = makeServer()

    notifyEmailRetry.plugin.register(server)
    const tick = vi.mocked(cron.schedule).mock.calls[0][1]

    await tick()

    expect(retryFailedQuoteEmails).toHaveBeenCalledWith({ pool: server.pg })
  })

  it('swallows a rejected run so a tick never throws', async () => {
    vi.mocked(cron.schedule).mockReturnValue({ stop: vi.fn() })
    vi.mocked(retryFailedQuoteEmails).mockRejectedValue(new Error('boom'))
    config.get.mockReturnValue({ enabled: true, schedule: '*/15 * * * *' })
    const server = makeServer()

    notifyEmailRetry.plugin.register(server)
    const tick = vi.mocked(cron.schedule).mock.calls[0][1]

    // The tick is fire-and-forget: it must not throw, and the rejection is
    // handled by the internal .catch (which runs on a later microtask).
    expect(() => tick()).not.toThrow()
    await new Promise((resolve) => setImmediate(resolve))

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(Error),
      'Notify email retry tick failed'
    )
  })
})
