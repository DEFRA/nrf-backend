import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'
import { configDotenv } from 'dotenv'

convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = process.env.NODE_ENV === 'development'
const postgresPortDefault = 5432
const postgresPortTest = 5433
const localStack = 'http://localhost:4566'

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
  useSwagger: {
    doc: 'Enable Swagger API documentation at /docs',
    format: Boolean,
    default: false,
    env: 'USE_SWAGGER'
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
  },
  cdpUploader: {
    url: {
      doc: 'Endpoint for the CDP Uploader service. Auto-derived from ENVIRONMENT if not set.',
      format: String,
      default: null,
      nullable: true,
      env: 'CDP_UPLOADER_URL'
    },
    bucket: {
      doc: 'S3 bucket for file uploads',
      format: String,
      default: 'boundaries',
      env: 'CDP_UPLOADER_BUCKET'
    }
  },
  impactAssessor: {
    url: {
      doc: 'Endpoint for the nrf-impact-assessor service. Auto-derived from ENVIRONMENT if not set.',
      format: String,
      default: 'http://localhost:8085',
      nullable: true,
      env: 'IMPACT_ASSESSOR_URL'
    }
  },
  s3: {
    endpoint: {
      doc: 'S3 endpoint URL (for localstack in development)',
      format: String,
      nullable: true,
      default: isDevelopment ? localStack : null,
      env: 'S3_ENDPOINT'
    },
    forcePathStyle: {
      doc: 'Use path-style addressing for S3 (required for localstack)',
      format: Boolean,
      default: isDevelopment,
      env: 'S3_FORCE_PATH_STYLE'
    }
  },
  postgres: {
    host: {
      doc: 'host for postgres',
      format: String,
      default: 'localhost',
      env: 'DB_HOST'
    },
    port: {
      doc: 'port for postgres',
      format: Number,
      default: isTest ? postgresPortTest : postgresPortDefault,
      env: 'DB_PORT'
    },
    database: {
      doc: 'database for postgres',
      format: String,
      default: 'nrf_backend',
      env: 'DB_DATABASE'
    },
    user: {
      doc: 'user for postgres',
      format: String,
      default: 'postgres',
      env: 'DB_USER'
    },
    ssl: {
      doc: 'connect using SSL',
      format: Boolean,
      default: isProduction,
      env: 'DB_SSL'
    },
    useIAM: {
      doc: 'enable iam authentication for postgres',
      format: Boolean,
      default: isProduction,
      env: 'DB_IAM_AUTHENTICATION'
    },
    localPassword: {
      doc: 'password for local development. used when iamAuthentication is not enabled',
      format: String,
      default: 'password',
      env: 'DB_LOCAL_PASSWORD'
    },
    region: {
      doc: 'AWS region',
      format: String,
      default: 'eu-west-2',
      env: 'AWS_REGION'
    }
  },
  aws: {
    region: {
      doc: 'AWS region',
      format: String,
      default: 'eu-west-2',
      env: 'AWS_REGION'
    }
  },
  sns: {
    endpoint: {
      doc: 'AWS SNS endpoint (from cdp-app-config defaults)',
      format: String,
      default: localStack,
      env: 'SNS_ENDPOINT'
    },
    topic: {
      nrfQuoteEstimateRequest: {
        arn: {
          doc: 'AWS SNS Topic ARN for quote estimate events',
          format: String,
          default:
            'arn:aws:sns:eu-west-2:000000000000:nrf-quote-estimate-request',
          env: 'SNS_TOPIC_ARN_QUOTE_ESTIMATE_REQUEST'
        }
      }
    }
  }
})

config.validate({ allowed: 'strict' })

export { config }
