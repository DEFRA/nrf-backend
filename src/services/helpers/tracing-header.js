import { config } from '../../config.js'
import { getTraceId } from '@defra/hapi-tracing'

/**
 * Adds the CDP tracing header to a headers object if a trace ID is active.
 * @param {Record<string, string>} [headers]
 * @returns {Record<string, string>}
 */
export const addTracingHeader = (headers = {}) => {
  const tracingHeader = config.get('tracing.header')
  const traceId = getTraceId()
  if (traceId) {
    return { ...headers, [tracingHeader]: traceId }
  }
  return { ...headers }
}
