import https from 'https'
import axios from 'axios'
import { createNotifyClient } from './notify-client.js'
import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'

vi.mock('axios', () => ({
  default: { create: vi.fn().mockReturnValue('mock-axios-instance') }
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

describe('createNotifyClient', () => {
  test('returns a NotifyClient instance when api key is set', () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify') return { apiKey: 'test-api-key' }
      if (key === 'httpProxy') return null
    })

    const result = createNotifyClient()

    expect(NotifyClient).toHaveBeenCalledWith('test-api-key')
    expect(result).toBeInstanceOf(NotifyClient)
    expect(result.setClient).not.toHaveBeenCalled()
  })

  test('uses global https agent via custom axios client when proxy is configured', () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify') return { apiKey: 'test-api-key' }
      if (key === 'httpProxy') return 'http://proxy:3128'
    })

    const result = createNotifyClient()

    expect(axios.create).toHaveBeenCalledWith({
      httpsAgent: https.globalAgent,
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
