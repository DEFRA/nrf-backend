import { createNotifyClient } from './notify-client.js'
import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'

vi.mock('notifications-node-client', () => ({
  NotifyClient: vi.fn(function () {})
}))

vi.mock('../../config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

const mockLogger = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue(mockLogger)
}))

describe('createNotifyClient', () => {
  test('returns a NotifyClient instance', () => {
    config.get.mockReturnValue({ apiKey: 'test-api-key' })

    const result = createNotifyClient()

    expect(NotifyClient).toHaveBeenCalledWith('test-api-key')
    expect(result).toBeInstanceOf(NotifyClient)
  })

  test('throws when api key is not set', () => {
    config.get.mockReturnValue({ apiKey: undefined })

    expect(() => createNotifyClient()).toThrow('Notify API key is not set')
    expect(NotifyClient).not.toHaveBeenCalled()
  })
})
