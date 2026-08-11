import cron from 'node-cron'
import { notifyStatusPoller } from './notify-status-poller.js'
import { pollNotifyEmailStatuses } from '../services/send-email/poll-notify-email-statuses.js'

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

describe('notifyStatusPoller plugin', () => {
  beforeEach(() => {
    vi.mocked(pollNotifyEmailStatuses).mockResolvedValue(undefined)
  })

  it('does not schedule when disabled', () => {
    config.get.mockReturnValue({ enabled: false, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyStatusPoller.plugin.register(server)

    expect(cron.schedule).not.toHaveBeenCalled()
    expect(server.ext).not.toHaveBeenCalled()
  })

  it('schedules on the configured cron expression and stops the task on shutdown', () => {
    const stop = vi.fn()
    vi.mocked(cron.schedule).mockReturnValue({ stop })
    config.get.mockReturnValue({ enabled: true, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyStatusPoller.plugin.register(server)

    expect(cron.schedule).toHaveBeenCalledWith(
      '*/5 * * * *',
      expect.any(Function)
    )
    server.extHandlers.onPreStop()
    expect(stop).toHaveBeenCalled()
  })

  it('invokes the poller with server.pg on each tick', async () => {
    vi.mocked(cron.schedule).mockReturnValue({ stop: vi.fn() })
    config.get.mockReturnValue({ enabled: true, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyStatusPoller.plugin.register(server)
    const tick = vi.mocked(cron.schedule).mock.calls[0][1]

    await tick()

    expect(pollNotifyEmailStatuses).toHaveBeenCalledWith({ pool: server.pg })
  })

  it('swallows a rejected poll so a tick never throws', async () => {
    vi.mocked(cron.schedule).mockReturnValue({ stop: vi.fn() })
    vi.mocked(pollNotifyEmailStatuses).mockRejectedValue(new Error('boom'))
    config.get.mockReturnValue({ enabled: true, schedule: '*/5 * * * *' })
    const server = makeServer()

    notifyStatusPoller.plugin.register(server)
    const tick = vi.mocked(cron.schedule).mock.calls[0][1]

    // The tick is fire-and-forget: it must not throw, and the rejection is
    // handled by the internal .catch (which runs on a later microtask).
    expect(() => tick()).not.toThrow()
    await new Promise((resolve) => setImmediate(resolve))

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(Error),
      'Notify status poll tick failed'
    )
  })
})
