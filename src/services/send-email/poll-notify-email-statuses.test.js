import { pollNotifyEmailStatuses } from './poll-notify-email-statuses.js'
import { dbGetPendingEmailNotifications } from '../db/quote-email-notifications/get-pending-email-notifications.js'
import { dbUpdateEmailNotificationStatus } from '../db/quote-email-notifications/update-email-notification-status.js'
import { getNotificationStatus } from './get-notification-status.js'

vi.mock('../db/quote-email-notifications/get-pending-email-notifications.js')
vi.mock('../db/quote-email-notifications/update-email-notification-status.js')
vi.mock('./get-notification-status.js')

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}))
vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}))

// A pooled client whose every `query` resolves with the given lock outcome.
// The worker only inspects the first query's result; the unlock query result is
// unused. `pool.connect` resolves to this client so the session-level advisory
// lock spans the run.
const makePool = (locked = true) => {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [{ locked }] }),
    release: vi.fn()
  }
  return { pool: { connect: vi.fn().mockResolvedValue(client) }, client }
}

describe('pollNotifyEmailStatuses', () => {
  it('claims the lock, polls each pending notification and persists its status', async () => {
    const { pool, client } = makePool(true)
    dbGetPendingEmailNotifications.mockResolvedValue([
      { id: 1, notification_id: 'uuid-1' },
      { id: 2, notification_id: 'uuid-2' }
    ])
    getNotificationStatus.mockResolvedValue({
      status: 'delivered',
      sentAt: null,
      completedAt: null
    })

    await pollNotifyEmailStatuses({ pool })

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock')
    )
    expect(dbGetPendingEmailNotifications).toHaveBeenCalledWith({
      db: client,
      limit: 50,
      maxAgeDays: 14
    })
    expect(getNotificationStatus).toHaveBeenCalledTimes(2)
    expect(getNotificationStatus).toHaveBeenCalledWith('uuid-1')
    expect(getNotificationStatus).toHaveBeenCalledWith('uuid-2')
    expect(dbUpdateEmailNotificationStatus).toHaveBeenCalledTimes(2)
  })

  it('releases the client and advisory lock in finally', async () => {
    const { pool, client } = makePool(true)
    dbGetPendingEmailNotifications.mockResolvedValue([])

    await pollNotifyEmailStatuses({ pool })

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock')
    )
    expect(client.release).toHaveBeenCalled()
  })

  it('skips the tick when another instance holds the lock', async () => {
    const { pool, client } = makePool(false)

    await pollNotifyEmailStatuses({ pool })

    expect(dbGetPendingEmailNotifications).not.toHaveBeenCalled()
    expect(getNotificationStatus).not.toHaveBeenCalled()
    // still releases its own client
    expect(client.release).toHaveBeenCalled()
  })

  it('isolates a single notification failure so the rest of the batch still runs', async () => {
    const { pool } = makePool(true)
    dbGetPendingEmailNotifications.mockResolvedValue([
      { id: 1, notification_id: 'uuid-1' },
      { id: 2, notification_id: 'uuid-2' }
    ])
    getNotificationStatus
      .mockRejectedValueOnce(new Error('notify blip'))
      .mockResolvedValueOnce({
        status: 'delivered',
        sentAt: null,
        completedAt: null
      })

    await pollNotifyEmailStatuses({ pool })

    expect(getNotificationStatus).toHaveBeenCalledTimes(2)
    expect(dbUpdateEmailNotificationStatus).toHaveBeenCalledTimes(1)
    expect(dbUpdateEmailNotificationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, status: 'delivered' })
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: 'uuid-1' }),
      expect.any(String)
    )
  })

  it('aborts the batch when a status persist fails, so a dead connection wastes no further Notify calls', async () => {
    const { pool } = makePool(true)
    dbGetPendingEmailNotifications.mockResolvedValue([
      { id: 1, notification_id: 'uuid-1' },
      { id: 2, notification_id: 'uuid-2' },
      { id: 3, notification_id: 'uuid-3' }
    ])
    getNotificationStatus.mockResolvedValue({
      status: 'delivered',
      sentAt: null,
      completedAt: null
    })
    dbUpdateEmailNotificationStatus.mockRejectedValueOnce(
      new Error('connection terminated')
    )

    await pollNotifyEmailStatuses({ pool })

    // Row 1's DB write failed -> the connection is presumed dead, so the loop
    // breaks and rows 2 and 3 are never fetched from Notify.
    expect(getNotificationStatus).toHaveBeenCalledTimes(1)
    expect(dbUpdateEmailNotificationStatus).toHaveBeenCalledTimes(1)
  })

  it('still releases the client when the advisory-unlock query rejects', async () => {
    const { pool, client } = makePool(true)
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('pg_advisory_unlock')) {
        throw new Error('connection terminated')
      }
      return { rows: [{ locked: true }] }
    })
    dbGetPendingEmailNotifications.mockResolvedValue([])

    await pollNotifyEmailStatuses({ pool })

    // The dead client is released with the error so pg-pool destroys it rather
    // than returning it to the pool for reuse.
    expect(client.release).toHaveBeenCalledWith(expect.any(Error))
  })
})
