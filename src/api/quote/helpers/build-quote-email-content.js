import { formatCurrency } from '@defra/nrf-library'

import { fillEmailTemplate } from './fill-email-template.js'
import { getLevyAmount } from './get-levy-amount.js'
import { getPlanningTypeDisplay } from './get-planning-type-display.js'
import {
  QUOTE_EMAIL_SUBJECT,
  QUOTE_EMAIL_TEMPLATE
} from './quote-email-template.js'

/**
 * @typedef {{ subject: string, content: string }} EmailContent
 */

/**
 * @typedef {object} QuoteEmailEdp
 * @property {string} edpName
 * @property {object} levyGbp
 * @property {number | string} levyGbp.amountExcludingVat - a number from the PATCH payload, a string from the database (NUMERIC columns)
 * @property {number | string} levyGbp.amountInflationAdjusted - same
 */

/**
 * Builds the quote email by filling in its Notify-style template. It is sent
 * through a Notify template that only passes the subject and content through,
 * so the copy only ever changes with a backend deploy.
 *
 * @param {object} params
 * @param {string} params.nrfQuoteReference
 * @param {string} params.nrfServiceUrl
 * @param {QuoteEmailEdp[]} params.edps
 * @param {number} params.housingUnits
 * @param {string} params.planningType
 * @param {string} params.requestToUseLink
 * @returns {EmailContent}
 */
export const buildQuoteEmailContent = ({
  nrfQuoteReference,
  nrfServiceUrl,
  edps,
  housingUnits,
  planningType,
  requestToUseLink
}) => {
  const { levyAmountExcludingVat, levyAmountInflationAdjusted } =
    getLevyAmount(edps)

  return {
    subject: QUOTE_EMAIL_SUBJECT,
    content: fillEmailTemplate({
      template: QUOTE_EMAIL_TEMPLATE,
      values: {
        nrfQuoteReference,
        edpNames: edps.map(({ edpName }) => edpName).join(', '),
        housingUnits,
        planningType: getPlanningTypeDisplay(planningType),
        levyAmount: formatCurrency(levyAmountExcludingVat, {
          hideZeroPence: true
        }),
        levyAmountInflationAdjusted: formatCurrency(
          levyAmountInflationAdjusted,
          { hideZeroPence: true }
        ),
        nrfServiceUrl,
        requestToUseLink
      }
    })
  }
}
