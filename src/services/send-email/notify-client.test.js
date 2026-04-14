import { createNotifyClient } from './notify-client.js'
import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'

vi.mock('notifications-node-client', () => ({
  NotifyClient: vi.fn(function () {
    this.setProxy = vi.fn()
  })
}))

vi.mock('../../config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

describe('createNotifyClient', () => {
  test('returns a NotifyClient instance with proxy configured', () => {
    config.get.mockReturnValue({ apiKey: 'test-api-key' })

    const result = createNotifyClient()

    expect(NotifyClient).toHaveBeenCalledWith('test-api-key')
    expect(result.setProxy).toHaveBeenCalledWith({
      host: 'http://localhost',
      port: 3128
    })
    expect(result).toBeInstanceOf(NotifyClient)
  })

  test('throws when api key is not set', () => {
    config.get.mockReturnValue({ apiKey: undefined })

    expect(() => createNotifyClient()).toThrow('Notify API key is not set')
    expect(NotifyClient).not.toHaveBeenCalled()
  })
})
