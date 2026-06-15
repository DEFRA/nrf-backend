import { ecsFormat } from '@elastic/ecs-pino-format'
import { config } from '../../../config.js'
import { getTraceId } from '@defra/hapi-tracing'
import { structureErrorForECS } from './log-formatters.js'

const logConfig = config.get('log')
const serviceName = config.get('serviceName')
const serviceVersion = config.get('serviceVersion')
const tracingHeader = config.get('tracing.header')

const ecsOptions = ecsFormat({ serviceVersion, serviceName })

const formatters = {
  ecs: {
    ...ecsOptions,
    formatters: {
      ...ecsOptions.formatters,
      log(object) {
        if (object.err instanceof Error) {
          const { err, ...rest } = object
          const ecsFormatted = ecsOptions.formatters?.log
            ? ecsOptions.formatters.log(rest)
            : rest
          return { ...ecsFormatted, ...structureErrorForECS(err) }
        }
        return ecsOptions.formatters?.log
          ? ecsOptions.formatters.log(object)
          : object
      }
    }
  },
  'pino-pretty': { transport: { target: 'pino-pretty' } }
}

export const loggerOptions = {
  enabled: logConfig.isEnabled,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  ...formatters[logConfig.format],
  nesting: true,
  mixin() {
    const mixinValues = {}
    const traceId = getTraceId()
    if (traceId) {
      mixinValues.trace = { id: traceId }
    }
    return mixinValues
  },
  getChildBindings(request) {
    const traceId = request.headers?.[tracingHeader]

    return {
      url: {
        path: request.url.pathname
      },
      ...(traceId
        ? {
            trace: { id: traceId },
            http: {
              request: { headers: { [tracingHeader]: traceId } }
            },
            req: { headers: { [tracingHeader]: traceId } }
          }
        : {})
    }
  }
}
