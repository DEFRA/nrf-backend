import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'
import { configDotenv } from 'dotenv'

convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = process.env.NODE_ENV === 'development'

if (isDevelopment) {
  configDotenv()
}

const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'nrf-backend'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  s3: {
    endpoint: {
      doc: 'S3 endpoint URL. Set for LocalStack, null for real AWS.',
      format: String,
      nullable: true,
      default: null,
      env: 'S3_ENDPOINT'
    },
    bucketName: {
      doc: 'S3 bucket name',
      format: String,
      default: '',
      env: 'S3_BUCKET_NAME'
    },
    forcePathStyle: {
      doc: 'Force path style for S3 (required for LocalStack)',
      format: Boolean,
      default: true,
      env: 'S3_FORCE_PATH_STYLE'
    }
  },
  db: {
    host: {
      doc: 'Database host',
      format: String,
      default: 'localhost',
      env: 'DATABASE_HOST'
    },
    port: {
      doc: 'Database port',
      format: 'port',
      default: 5432,
      env: 'DATABASE_PORT'
    },
    database: {
      doc: 'Database name',
      format: String,
      default: 'nrf',
      env: 'DATABASE_NAME'
    },
    username: {
      doc: 'Database username',
      format: String,
      default: 'postgres',
      env: 'DATABASE_USERNAME'
    },
    password: {
      doc: 'Database password',
      format: String,
      default: 'postgres',
      env: 'DATABASE_PASSWORD'
    }
  },
  notify: {
    apiKey: {
      doc: 'API key for Notify',
      format: String,
      default: '',
      env: 'NOTIFY_API_KEY'
    },
    templateIds: {
      quote: {
        doc: 'Notify template ID for quote email',
        format: String,
        default: 'af6368ca-b1ee-4199-a9da-8fabb0a2d5e8',
        env: 'NOTIFY_TEMPLATE_ID_QUOTE'
      }
    }
  }
})

config.validate({ allowed: 'strict' })

export { config }
