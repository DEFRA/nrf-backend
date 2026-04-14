import axios from 'axios'
import { HttpsProxyAgent } from 'hpagent'
import { createNotifyClient } from './notify-client.js'
import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'

vi.mock('axios', () => ({
  default: { create: vi.fn().mockReturnValue('mock-axios-instance') }
}))

vi.mock('hpagent', () => ({
  HttpsProxyAgent: vi.fn(class HttpsProxyAgent {})
}))

vi.mock('notifications-node-client', () => ({
  NotifyClient: vi.fn(function () {
    this.setClient = vi.fn()
  })
}))

vi.mock('../../config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }))
vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue(mockLogger)
}))

describe('createNotifyClient', () => {
  test('logs error and returns client without proxy when cdpHttpProxy is not set', () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify') return { apiKey: 'test-api-key' }
      if (key === 'cdpHttpProxy') return null
    })

    const result = createNotifyClient()

    expect(NotifyClient).toHaveBeenCalledWith('test-api-key')
    expect(result).toBeInstanceOf(NotifyClient)
    expect(result.setClient).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith('cdpHttpProxy is not set')
  })

  test('configures proxy agent when cdpHttpProxy is set', () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify') return { apiKey: 'test-api-key' }
      if (key === 'cdpHttpProxy') return 'http://proxy:3128'
    })

    const result = createNotifyClient()

    expect(HttpsProxyAgent).toHaveBeenCalledWith({ proxy: 'http://proxy:3128' })
    expect(axios.create).toHaveBeenCalledWith({
      proxy: false,
      httpsAgent: expect.any(HttpsProxyAgent)
    })
    expect(result.setClient).toHaveBeenCalledWith('mock-axios-instance')
  })

  test('throws when api key is not set', () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify') return { apiKey: undefined }
    })

    expect(() => createNotifyClient()).toThrow('Notify API key is not set')
    expect(NotifyClient).not.toHaveBeenCalled()
  })
})
