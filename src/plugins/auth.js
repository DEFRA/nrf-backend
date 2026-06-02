import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import Boom from '@hapi/boom'

import { config } from '../config.js'

const HEADER_NAME = 'x-api-key'
const STRATEGY_NAME = 'service-api-key'

function constantTimeEquals(a, b) {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) {
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}

const apiKeyScheme = () => ({
  authenticate(request, h) {
    const expected = config.get('apiKey')
    if (!expected) {
      return h.unauthenticated(
        Boom.internal('Service API key not configured'),
        { credentials: {} }
      )
    }

    const provided = request.headers[HEADER_NAME]
    if (!provided || !constantTimeEquals(provided, expected)) {
      return h.unauthenticated(Boom.unauthorized('Invalid API key'), {
        credentials: {}
      })
    }

    return h.authenticated({ credentials: { caller: 'service' } })
  }
})

const auth = {
  plugin: {
    name: 'auth',
    register: (server) => {
      server.auth.scheme('api-key', apiKeyScheme)
      server.auth.strategy(STRATEGY_NAME, 'api-key')
      server.auth.default(STRATEGY_NAME)
    }
  }
}

export { auth }
