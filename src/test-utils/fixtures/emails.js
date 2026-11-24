import { validEdpsPayload } from './quotePayloads.js'

const NRL_REFERENCE = 'NRL-000042'
const SERVICE_URL = 'http://localhost:3000'

/**
 * @param {{ edpName: string, amountExcludingVat: number, amountInflationAdjusted: number }} params
 */
export const edpWithLevy = ({
  edpName,
  amountExcludingVat,
  amountInflationAdjusted
}) => ({
  edpName,
  levyGbp: { amountExcludingVat, amountInflationAdjusted }
})

export const validQuoteEmailInput = {
  nrfQuoteReference: NRL_REFERENCE,
  nrfServiceUrl: SERVICE_URL,
  edps: validEdpsPayload.edps,
  housingUnits: 10,
  planningType: 'full-planning-permission',
  requestToUseLink: `${SERVICE_URL}/request-to-use/enter-nrl-reference?nrlReference=${NRL_REFERENCE}`
}

export const validRetrieveQuoteEmailInput = {
  nrfQuoteReference: NRL_REFERENCE,
  retrieveQuoteUrl: `${SERVICE_URL}/request-to-use/retrieve/${NRL_REFERENCE}/abc123token`
}
