import { config } from '../../../config.js'

/**
 * Builds the public quote access link a user follows from their email.
 *
 * @param {object} params
 * @param {string} params.reference - the quote reference (e.g. NRL-000001)
 * @param {string} params.rawToken - the raw (unhashed) access token
 * @returns {string} the full quote access URL
 */
export const buildQuoteAccessLink = ({ reference, rawToken }) => {
  const frontEndBaseUrl = config.get('frontEndBaseUrl')
  return `${frontEndBaseUrl}/quote/${reference}/${rawToken}`
}
