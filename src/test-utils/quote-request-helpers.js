import { randomUUID } from 'node:crypto'

import { routePath } from '../routes/quote.js'
import { generateToken } from '../common/helpers/token/generate-token.js'
import { hashToken } from '../common/helpers/token/hash-token.js'
import {
  validQuotePayload,
  validEdpsPayload
} from './fixtures/quotePayloads.js'

export const createQuote = (server) =>
  server.inject({
    method: 'POST',
    url: routePath,
    payload: validQuotePayload
  })

export const createQuoteWithEdps = async (server) => {
  const postResponse = await createQuote(server)
  const { reference } = JSON.parse(postResponse.payload)
  await sendPatchRequest({ server, reference, payload: validEdpsPayload })
  return reference
}

export const sendGetRequest = ({
  server,
  reference,
  bearerToken,
  redeem,
  requestToUse
}) => {
  const params = new URLSearchParams()
  if (redeem !== undefined) {
    params.set('redeem', redeem)
  }
  //TODO - remove request to use
  if (requestToUse !== undefined) {
    params.set('requestToUse', requestToUse)
  }
  const query = params.toString() ? `?${params.toString()}` : ''
  return server.inject({
    method: 'GET',
    url: `${routePath}/${reference}${query}`,
    headers: bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}
  })
}

export const sendPatchRequest = ({ server, reference, payload }) =>
  server.inject({
    method: 'PATCH',
    url: `${routePath}/${reference}`,
    payload
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
 * Overrides let tests create expired or session-exhausted tokens.
 */
export const issueAccessToken = async ({
  server,
  reference,
  expiresAt,
  sessionCount = 0,
  maxSessions = 5
}) => {
  const quoteId = await getQuoteId({ server, reference })
  const { raw, hash } = generateToken()

  await server.pg.query(
    `INSERT INTO quote_access_tokens
       (token_hash, quote_id, expires_at, session_count, max_sessions)
     VALUES ($1, $2, COALESCE($3, now() + interval '7 days'), $4, $5)`,
    [hash, quoteId, expiresAt ?? null, sessionCount, maxSessions]
  )

  return raw
}

/**
 * Inserts a quote_email_notifications row directly with an explicit status and
 * created_at, letting tests stage delivery failures and retry attempts that the
 * API only produces asynchronously (via the Notify poller / retry worker).
 *
 * @param {object} params
 * @param {object} params.server - test server with a real pg pool
 * @param {number} params.quoteId
 * @param {string} params.emailType - 'quote_result' | 'resend' | 'retry' | 'retry_rejected'
 * @param {string|null} [params.status] - Notify delivery status, null while still in flight
 * @param {Date|null} [params.createdAt] - defaults to now()
 */
export const insertEmailNotification = async ({
  server,
  quoteId,
  emailType,
  status = null,
  createdAt = null
}) => {
  await server.pg.query(
    `INSERT INTO quote_email_notifications
       (quote_id, notification_id, email_type, status, created_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, now()))`,
    [quoteId, randomUUID(), emailType, status, createdAt]
  )
}

export const getAccessTokenRow = async ({ server, rawToken }) => {
  const { rows } = await server.pg.query(
    'SELECT * FROM quote_access_tokens WHERE token_hash = $1',
    [hashToken(rawToken)]
  )
  return rows[0]
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
