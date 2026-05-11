import { config } from '../../config.js'
import { getTraceId } from '@defra/hapi-tracing'

/**
 * Adds the CDP tracing header to a headers object if a trace ID is active.
 * Mutates and returns the passed object.
 * @param {Record<string, string>} [headers]
 * @returns {Record<string, string>}
 */
export const addTracingHeader = (headers = {}) => {
  const tracingHeader = config.get('tracing.header')
  const traceId = getTraceId()
  if (traceId) {
    headers[tracingHeader] = traceId
  }
  return headers
}
