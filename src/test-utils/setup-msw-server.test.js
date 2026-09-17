import { http, HttpResponse } from 'msw'

import { setupMswServer } from './setup-msw-server.js'

describe('setupMswServer', () => {
  describe('starts the server with the provided handlers', () => {
    // An unmatched request with `onUnhandledRequest: 'error'` is a loud failure
    // — MSW logs it via console.error before rejecting. That output is the
    // behaviour under test, not a real error, so it is silenced for this scope.
    let consoleErrorSpy

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
    })

    setupMswServer(
      http.get('https://test.example/quotes/1', () =>
        HttpResponse.json({ id: 1, status: 'draft' })
      )
    )

    it('intercepts requests matched by the handlers', async () => {
      const res = await fetch('https://test.example/quotes/1')

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ id: 1, status: 'draft' })
    })

    it('rejects requests with no matching handler so a wrong URL fails loudly', async () => {
      // With onUnhandledRequest: 'error' the request itself is rejected, so it
      // can never silently fall through to the real fetch.
      await expect(fetch('https://test.example/quotes/999')).rejects.toThrow()
    })
  })

  describe('resets request handlers between tests', () => {
    let consoleErrorSpy

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
    })

    const server = setupMswServer()

    it('uses handlers added with server.use() during a test', async () => {
      server.use(
        http.get('https://test.example/temporary', () =>
          HttpResponse.json({ temporary: true })
        )
      )

      const res = await fetch('https://test.example/temporary')
      expect(await res.json()).toEqual({ temporary: true })
    })

    it('does not keep those handlers for the next test', async () => {
      await expect(fetch('https://test.example/temporary')).rejects.toThrow()
    })
  })

  describe('closes the server when the describe scope ends', () => {
    // Captured before the inner scope's server starts listening, so the test
    // below can prove close() put it back.
    let fetchBeforeListen

    beforeAll(() => {
      fetchBeforeListen = globalThis.fetch
    })

    describe('while the server is running', () => {
      setupMswServer(
        http.get('https://test.example/health', () =>
          HttpResponse.json({ ok: true })
        )
      )

      it('intercepts requests while the scope is active', async () => {
        const res = await fetch('https://test.example/health')
        expect(await res.json()).toEqual({ ok: true })
      })
    })

    it('stops intercepting requests once the scope has ended', () => {
      // The inner describe's afterAll has closed its server, so MSW restored
      // the global.fetch that was in place before listen(). If the server were
      // still listening, global.fetch would be MSW's interceptor instead.
      expect(globalThis.fetch).toBe(fetchBeforeListen)
    })
  })
})
