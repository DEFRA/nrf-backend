import { createRequestLogger } from '@defra/nrf-library'

import { loggerOptions } from './logger-options.js'

const requestLogger = createRequestLogger(loggerOptions)

export { requestLogger }
