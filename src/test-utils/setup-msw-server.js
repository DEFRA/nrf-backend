import { beforeAll, afterEach, afterAll } from 'vitest'
import { setupServer } from 'msw/node'

/**
 * Set up an MSW server for a test file. The server listens for the lifetime of
 * the file (beforeAll), resets handlers between tests (afterEach) and closes on
 * completion (afterAll). Any request that isn't matched by a handler is treated
 * as an error, so a call made with the wrong URL/method fails the test loudly.
 *
 * @param {...import('msw').RequestHandler} handlers
 * @returns {import('msw/node').SetupServer}
 */
export const setupMswServer = (...handlers) => {
  const server = setupServer(...handlers)

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  return server
}
