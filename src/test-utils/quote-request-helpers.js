import { randomUUID } from 'node:crypto'

import { routePath } from '../routes/quote.js'
import { generateToken } from '../common/helpers/token/generate-token.js'
import {
  validQuotePayload,
  validEdpsPayload
} from './fixtures/quotePayloads.js'

const MS_PER_MINUTE = 60_000

/**
 * @param {object} params
 * @param {object} params.server - test server
 * @param {object} [params.overrides] - payload fields to override, e.g. an
 *   approved internal email or `disableAnalyticsAudit: true`
 */
export const createQuote = (server, overrides = {}) =>
  server.inject({
    method: 'POST',
    url: routePath,
    payload: { ...validQuotePayload, ...overrides }
  })

export const createQuoteWithEdps = async (server) => {
  const postResponse = await createQuote(server)
  const { reference } = JSON.parse(postResponse.payload)
  await sendPatchRequest({ server, reference, payload: validEdpsPayload })
  return reference
}

export const sendGetRequest = ({ server, reference }) =>
  server.inject({
    method: 'GET',
    url: `${routePath}/${reference}`
  })

export const sendRedeemTokenRequest = ({ server, reference, token }) =>
  server.inject({
    method: 'POST',
    url: `${routePath}/${reference}/redeem-token`,
    payload: { token }
  })

export const sendPatchRequest = ({ server, reference, payload }) =>
  server.inject({
    method: 'PATCH',
    url: `${routePath}/${reference}`,
    payload
  })

export const sendDeleteRequest = ({ server, reference }) =>
  server.inject({
    method: 'DELETE',
    url: `${routePath}/${reference}`
  })

export const sendResendKnownRequest = ({ server, reference, token }) =>
  server.inject({
    method: 'POST',
    url: `${routePath}/${reference}/resend-known`,
    payload: { token }
  })

export const sendResendUnknownRequest = ({ server, reference, email }) =>
  server.inject({
    method: 'POST',
    url: `${routePath}/${reference}/resend-unknown`,
    payload: { email }
  })

export const getQuoteId = async ({ server, reference }) => {
  const { rows } = await server.pg.query(
    'SELECT id FROM quotes WHERE reference = $1',
    [reference]
  )
  return rows[0].id
}

/**
 * Inserts an access token row directly for a quote and returns the raw token.
 * Pass expiresAt to create an expired token.
 */
export const issueAccessToken = async ({ server, reference, expiresAt }) => {
  const quoteId = await getQuoteId({ server, reference })
  const { raw, hash } = generateToken()

  await server.pg.query(
    `INSERT INTO quote_access_tokens (token_hash, quote_id, expires_at)
     VALUES ($1, $2, COALESCE($3, now() + interval '24 hours'))`,
    [hash, quoteId, expiresAt ?? null]
  )

  return raw
}

export const minutesAgo = (minutes) =>
  new Date(Date.now() - minutes * MS_PER_MINUTE)

/**
 * Inserts a quote_email_notifications row directly with an explicit status,
 * retry_count and created_at, letting tests stage delivery failures and prior
 * retry attempts that the API only produces asynchronously (via the Notify
 * poller / retry worker).
 *
 * @param {object} params
 * @param {object} params.server - test server with a real pg pool
 * @param {number} params.quoteId
 * @param {import('../common/constants/email-type.js').EmailType} params.emailType
 * @param {string|null} [params.status] - Notify delivery status, null while still in flight
 * @param {number} [params.retryCount=0] - number of retry attempts already made against this row
 * @param {Date|null} [params.createdAt] - defaults to now()
 */
export const insertEmailNotification = async ({
  server,
  quoteId,
  emailType,
  status = null,
  retryCount = 0,
  createdAt = null
}) => {
  await server.pg.query(
    `INSERT INTO quote_email_notifications
       (quote_id, notification_id, email_type, notify_send_status, retry_count, created_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))`,
    [quoteId, randomUUID(), emailType, status, retryCount, createdAt]
  )
}

export const createQuoteWithToken = async ({ server, ...overrides }) => {
  const postResponse = await createQuote(server)
  const { reference } = JSON.parse(postResponse.payload)
  const token = await issueAccessToken({ server, reference, ...overrides })
  return { reference, token }
}

export const redeemToken = async (params) => {
  const response = await sendRedeemTokenRequest(params)
  return JSON.parse(response.payload)
}

export const getAccessTokenRowsForReference = async ({ server, reference }) => {
  const { rows } = await server.pg.query(
    `SELECT t.* FROM quote_access_tokens t
       JOIN quotes q ON q.id = t.quote_id
      WHERE q.reference = $1
      ORDER BY t.created_at`,
    [reference]
  )
  return rows
}

export const getEmailNotificationRowsForReference = async ({
  server,
  reference
}) => {
  const { rows } = await server.pg.query(
    `SELECT n.* FROM quote_email_notifications n
       JOIN quotes q ON q.id = n.quote_id
      WHERE q.reference = $1
      ORDER BY n.created_at`,
    [reference]
  )
  return rows
}
