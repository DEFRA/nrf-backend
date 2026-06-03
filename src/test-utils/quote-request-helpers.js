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

export const sendGetRequest = ({ server, reference, bearerToken, redeem }) => {
  const query = redeem === undefined ? '' : `?redeem=${redeem}`
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

const getQuoteId = async ({ server, reference }) => {
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

export const getAccessTokenRow = async ({ server, rawToken }) => {
  const { rows } = await server.pg.query(
    'SELECT * FROM quote_access_tokens WHERE token_hash = $1',
    [hashToken(rawToken)]
  )
  return rows[0]
}
