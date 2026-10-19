import { config } from '../../../config.js'

/**
 * Builds the magic link in the retrieve your quote email.
 *
 * @param {object} params
 * @param {string} params.reference - the quote reference (e.g. NRL-000001)
 * @param {string} params.rawToken - the raw (unhashed) access token
 * @returns {string} the full frontend URL that redeems the token
 */
export const buildRetrieveQuoteUrl = ({ reference, rawToken }) =>
  `${config.get('frontEndBaseUrl')}/request-to-use/retrieve/${reference}/${rawToken}`
