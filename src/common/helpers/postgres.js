import Pool from 'pg-pool'
import { Signer } from '@aws-sdk/rds-signer'
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'
import Joi from 'joi'

/**
 * Creates a function that takes a set of options and returns a function that provides a Postgres password.
 * If useIAM is set to true then it will attempt to get a token from the AWS RDS API.
 * If it's not set then it returns the value set in localPassword, allowing for local development.
 * @param {{ host: string, port: number, user: string, region: string, useIAM: boolean, localPassword: string|null }} options
 */
function createPasswordProvider(options) {
  if (options.useIAM) {
    return async () => {
      const signer = new Signer({
        hostname: options.host,
        port: options.port,
        username: options.user,
        credentials: fromNodeProviderChain(),
        region: options.region
      })
      return signer.getAuthToken()
    }
  }

  return () => options.localPassword
}

const TWELVE_MINUTES_IN_SECONDS = 720

export const postgres = {
  plugin: {
    name: 'postgres',
    version: '0.0.0',
    /**
     *
     * @param { import('@hapi/hapi').Server } server
     * @param {{ host: string, port: number, user: string, database: string, region: string, useIAM: boolean, localPassword: string|null, ssl: boolean|null }} options
     */
    register: async function (server, options) {
      const { value, error } = optionsSchema.validate(options)
      if (error) {
        throw new Error(error)
      }
      const passwordProvider = createPasswordProvider(value)

      const poolConfig = {
        user: value.user,
        password: passwordProvider,
        host: value.host,
        port: value.port,
        database: value.database,
        maxLifetimeSeconds: TWELVE_MINUTES_IN_SECONDS, // must be less than 15 minutes
        ssl: value.ssl,
        ...value.pool
      }

      const pool = new Pool(poolConfig)

      // Test the connection
      await pool.query('SELECT 1')

      server.decorate('server', 'pg', pool)
      server.decorate('request', 'pg', pool)

      server.events.on('stop', async () => {
        await pool.end()
      })
    }
  }
}

const optionsSchema = Joi.object({
  user: Joi.string().required().description('postgres username'),
  host: Joi.string().required().description('hostname of the RDS instance'),
  port: Joi.number().required().description('port of the RDS instance'),
  database: Joi.string().required().description('database to connect to'),
  useIAM: Joi.boolean()
    .required()
    .description('Authenticate with the database using IAM credentials'),
  localPassword: Joi.string()
    .min(0)
    .empty(true)
    .optional()
    .description('Static password used when useIAM is set to false'),

  region: Joi.string()
    .when('useIAM', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    })
    .description('AWS region'),
  ssl: Joi.boolean().optional(),
  pool: Joi.object({
    connectionTimeoutMillis: Joi.number().optional(),
    idleTimeoutMillis: Joi.number().optional(),
    max: Joi.number().optional(),
    min: Joi.number().optional(),
    allowExitOnIdle: Joi.boolean().optional()
  })
    .optional()
    .unknown(true)
    .description('override postgres pool settings')
})
