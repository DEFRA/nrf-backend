import cron from 'node-cron'
import { notifyWorker } from './notify-worker.js'
import { pollNotifyEmailStatuses } from '../services/send-email/poll-notify-email-statuses.js'
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
vi.mock('../services/send-email/poll-notify-email-statuses.js')
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

describe('notifyWorker plugin', () => {
  beforeEach(() => {
    vi.mocked(pollNotifyEmailStatuses).mockResolvedValue(undefined)
    vi.mocked(retryFailedQuoteEmails).mockResolvedValue(undefined)
  })

  it('does not schedule when disabled', () => {
    config.get.mockReturnValue({ enabled: false, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyWorker.plugin.register(server)

    expect(cron.schedule).not.toHaveBeenCalled()
    expect(server.ext).not.toHaveBeenCalled()
  })

  it('schedules on the configured cron expression and stops on shutdown', () => {
    const stop = vi.fn()
    vi.mocked(cron.schedule).mockReturnValue({ stop })
    config.get.mockReturnValue({ enabled: true, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyWorker.plugin.register(server)

    expect(cron.schedule).toHaveBeenCalledWith(
      '*/5 * * * *',
      expect.any(Function)
    )
    server.extHandlers.onPreStop()
    expect(stop).toHaveBeenCalled()
  })

  it('runs the first tick immediately on startup', async () => {
    vi.mocked(cron.schedule).mockReturnValue({ stop: vi.fn() })
    config.get.mockReturnValue({ enabled: true, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyWorker.plugin.register(server)
    await new Promise((resolve) => setImmediate(resolve))

    expect(pollNotifyEmailStatuses).toHaveBeenCalledWith({ pool: server.pg })
    expect(retryFailedQuoteEmails).toHaveBeenCalledWith({ pool: server.pg })
  })

  it('polls then retries on each scheduled tick', async () => {
    vi.mocked(cron.schedule).mockReturnValue({ stop: vi.fn() })
    config.get.mockReturnValue({ enabled: true, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyWorker.plugin.register(server)
    const tick = vi.mocked(cron.schedule).mock.calls[0][1]

    await tick()
    await new Promise((resolve) => setImmediate(resolve))

    expect(pollNotifyEmailStatuses).toHaveBeenCalledWith({ pool: server.pg })
    expect(retryFailedQuoteEmails).toHaveBeenCalledWith({ pool: server.pg })
  })

  it('swallows a rejected tick so it never throws', async () => {
    vi.mocked(cron.schedule).mockReturnValue({ stop: vi.fn() })
    vi.mocked(pollNotifyEmailStatuses).mockRejectedValue(new Error('boom'))
    config.get.mockReturnValue({ enabled: true, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyWorker.plugin.register(server)
    const tick = vi.mocked(cron.schedule).mock.calls[0][1]

    expect(() => tick()).not.toThrow()
    await new Promise((resolve) => setImmediate(resolve))

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(Error),
      'Notify worker tick failed'
    )
  })
})
