import { getNotificationStatus } from './get-notification-status.js'
import { createNotifyClient } from './notify-client.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

vi.mock('./notify-client.js')
vi.mock('../../common/helpers/logging/logger.js')

describe('getNotificationStatus', () => {
  const notificationId = '47cbb989-9546-418c-8828-232c3dc57537'
  let getNotificationById
  let logger

  beforeEach(() => {
    getNotificationById = vi.fn()
    logger = { info: vi.fn(), error: vi.fn() }
    vi.mocked(createLogger).mockReturnValue(logger)
    vi.mocked(createNotifyClient).mockReturnValue({ getNotificationById })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns status and Notify-side timestamps from getNotificationById', async () => {
    getNotificationById.mockResolvedValue({
      data: {
        status: 'delivered',
        sent_at: '2026-08-10T09:00:00.000Z',
        completed_at: '2026-08-10T09:01:00.000Z'
      }
    })

    const result = await getNotificationStatus(notificationId)

    expect(getNotificationById).toHaveBeenCalledWith(notificationId)
    expect(result).toEqual({
      status: 'delivered',
      sentAt: '2026-08-10T09:00:00.000Z',
      completedAt: '2026-08-10T09:01:00.000Z'
    })
  })

  it('returns null timestamps when Notify omits them', async () => {
    getNotificationById.mockResolvedValue({ data: { status: 'sending' } })

    const result = await getNotificationStatus(notificationId)

    expect(result).toEqual({
      status: 'sending',
      sentAt: null,
      completedAt: null
    })
  })

  it('retries and resolves after a transient failure', async () => {
    getNotificationById
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({ data: { status: 'delivered' } })

    const promise = getNotificationStatus(notificationId)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(getNotificationById).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('delivered')
  })

  it('rejects when all retries are exhausted', async () => {
    getNotificationById.mockRejectedValue(new Error('Notify down'))

    const promise = getNotificationStatus(notificationId)
    // Attach the rejection handler before advancing timers so the rejection
    // is never observed as unhandled while the retry interval fires.
    const assertion = expect(promise).rejects.toThrow('Notify down')
    await vi.runAllTimersAsync()
    await assertion
  })
})
