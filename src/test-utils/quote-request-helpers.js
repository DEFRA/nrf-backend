import { routePath } from '../routes/quote.js'
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

export const sendGetRequest = ({ server, reference }) =>
  server.inject({
    method: 'GET',
    url: `${routePath}/${reference}`
  })

export const sendPatchRequest = ({ server, reference, payload }) =>
  server.inject({
    method: 'PATCH',
    url: `${routePath}/${reference}`,
    payload
  })
