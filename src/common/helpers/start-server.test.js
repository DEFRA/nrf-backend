import hapi from '@hapi/hapi'
import { http, HttpResponse } from 'msw'

import { statusCodes } from '../constants/status-codes.js'
import { setupMswServer } from '../../test-utils/setup-msw-server.js'

describe('#startServer', () => {
  const CDP_UPLOADER_HEALTH_URL = 'http://localhost:7338/health'

  const mswServer = setupMswServer(
    http.get(CDP_UPLOADER_HEALTH_URL, () => HttpResponse.json({ status: 'ok' }))
  )

  let createServerSpy
  let hapiServerSpy
  let startServerImport
  let createServerImport

  beforeAll(async () => {
    vi.stubEnv('PORT', '3098')
    createServerImport = await import('../../server.js')
    startServerImport = await import('./start-server.js')

    createServerSpy = vi.spyOn(createServerImport, 'createServer')
    hapiServerSpy = vi.spyOn(hapi, 'server')
  })

  afterAll(() => {
    vi.resetAllMocks()
  })

  describe('When server starts', () => {
    let server

    afterEach(async () => {
      await server?.stop()
    })

    test('Should start up server as expected', async () => {
      server = await startServerImport.startServer()

      expect(createServerSpy).toHaveBeenCalled()
      expect(hapiServerSpy).toHaveBeenCalled()
    })

    test('Should handle CDP Uploader health check failure', async () => {
      mswServer.use(
        http.get(
          CDP_UPLOADER_HEALTH_URL,
          () =>
            new HttpResponse(null, {
              status: statusCodes.serviceUnavailable
            })
        )
      )

      server = await startServerImport.startServer()

      expect(server).toBeDefined()
    })

    test('Should handle CDP Uploader health check network error', async () => {
      mswServer.use(
        http.get(CDP_UPLOADER_HEALTH_URL, () => HttpResponse.error())
      )

      server = await startServerImport.startServer()

      expect(server).toBeDefined()
    })
  })

  describe('When server start fails', () => {
    test('Should log failed startup message', async () => {
      createServerSpy.mockRejectedValue(new Error('Server failed to start'))

      await expect(startServerImport.startServer()).rejects.toThrow(
        'Server failed to start'
      )
    })
  })
})
