import { config } from '../../../config.js'

/**
 * Builds the link in the quote email that starts the request to use journey,
 * pre-filling the NRL reference on the enter your NRL reference page.
 *
 * @param {object} params
 * @param {string} params.reference - the quote reference (e.g. NRL-000001)
 * @returns {string} the full frontend URL
 */
export const buildRequestToUseLink = ({ reference }) =>
  `${config.get('frontEndBaseUrl')}/request-to-use/enter-nrl-reference?nrlReference=${reference}`
