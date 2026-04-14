import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { createNotifyClient } from './notify-client.js'
import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'

vi.mock('axios', () => ({
  default: { create: vi.fn().mockReturnValue('mock-axios-instance') }
}))

vi.mock('https-proxy-agent', () => ({
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
  test('logs error and skips proxy when httpProxy is not set', () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify') return { apiKey: 'test-api-key' }
      if (key === 'httpProxy') return null
    })

    const result = createNotifyClient()

    expect(NotifyClient).toHaveBeenCalledWith('test-api-key')
    expect(result).toBeInstanceOf(NotifyClient)
    expect(result.setClient).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith('httpProxy is not set')
  })

  test('configures proxy agent when httpProxy is set', () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify') return { apiKey: 'test-api-key' }
      if (key === 'httpProxy') return 'http://proxy:3128'
    })

    const result = createNotifyClient()

    expect(HttpsProxyAgent).toHaveBeenCalledWith('http://proxy:3128')
    expect(axios.create).toHaveBeenCalledWith({
      httpsAgent: expect.any(HttpsProxyAgent),
      proxy: false
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
