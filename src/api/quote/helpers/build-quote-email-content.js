import { formatCurrency } from '@defra/nrf-library'

import { GET_HELP_SECTION } from './get-help-section.js'
import { getLevyAmount } from './get-levy-amount.js'
import { getPlanningTypeDisplay } from './get-planning-type-display.js'

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

const QUOTE_EMAIL_TITLE = 'Nature restoration levy – quote'

// A non-breaking space is written as an escape so it stays visible: it was carried
// over from the Notify template to keep the rendered email unchanged.
const INDICATIVE_QUOTE_PARAGRAPH = `This is an indicative nature restoration levy quote, based on the details you provided. For the purposes of section 72 of the Planning and Infrastructure Act 2025, this quote\u00A0does not commit you to pay the nature restoration levy and does not disapply any relevant environmental obligations. A Local Planning Authority must not accept this quote as part of any planning and decision-making processes.`

const INFLATION_ADJUSTED_PARAGRAPH = `This shows the indicative levy amount for the year the quote was issued. The amount includes annual inflation in line with the Royal Institute of Chartered Surveyors (RICS) Community Infrastructure Levy (CIL) Index, published on 1 November and applied on 1 January for the following calendar year. This quote is indicative and subject to annual inflation. It shows the amount you may need to pay if you request to use the nature restoration levy.`

const HOW_THE_LEVY_WAS_CALCULATED_SECTION = `## How your nature restoration levy was calculated

Your levy has been calculated from the details you submitted and the charging schedule for the EDP. [Read about the charging schedule for the EDP](#).`

const WHAT_THE_LEVY_PAYS_FOR_SECTION = `## What your levy will pay for

Your levy will fund conservation measures delivered under the relevant EDPs, including their long-term management,\u00A0monitoring\u00A0and maintenance\u00A0as well as administration costs. EDPs set out measures needed to address the environmental impacts of development in an area and deliver an overall improvement in the conservation status of the environmental feature set out in the EDP.`

const FEEDBACK_SECTION =
  '[What do you think of this service? (opens in new tab)](https://defragroup.eu.qualtrics.com/jfe/form/SV_9yRhrdtbb3vmw86?Journey=Quote) (takes 30 seconds)'

/**
 * @param {QuoteEmailEdp[]} edps
 * @returns {{ levyAmount: string, levyAmountInflationAdjusted: string }}
 */
const formatLevyAmounts = (edps) => {
  const { levyAmountExcludingVat, levyAmountInflationAdjusted } =
    getLevyAmount(edps)

  return {
    levyAmount: formatCurrency(levyAmountExcludingVat, {
      hideZeroPence: true
    }),
    levyAmountInflationAdjusted: formatCurrency(levyAmountInflationAdjusted, {
      hideZeroPence: true
    })
  }
}

/**
 * @param {{ nrfQuoteReference: string, nrfServiceUrl: string }} params
 * @returns {string}
 */
const introductionSection = ({
  nrfQuoteReference,
  nrfServiceUrl
}) => `# ${QUOTE_EMAIL_TITLE}

## NRL reference: ${nrfQuoteReference}

Thank you for submitting details of the relevant development on [Get a quote for the nature restoration levy](${nrfServiceUrl}).

${INDICATIVE_QUOTE_PARAGRAPH}`

/**
 * @param {{ planningType: string, housingUnits: number }} params
 * @returns {string}
 */
const developmentDetailsSection = ({
  planningType,
  housingUnits
}) => `## Details of your relevant development

You told us the relevant development\u00A0is planned to have:
- ${getPlanningTypeDisplay(planningType)}
- housing with a total of ${housingUnits} unit(s)`

/**
 * @param {{ edps: QuoteEmailEdp[] }} params
 * @returns {string}
 */
const levySection = ({ edps }) => {
  const { levyAmount, levyAmountInflationAdjusted } = formatLevyAmounts(edps)
  const edpNames = edps.map(({ edpName }) => edpName).join(', ')

  return `## What you might need to pay

Your relevant development is planned in ${edpNames}.

### Provisional nature restoration levy amount: ${levyAmount} (plus VAT)

The amount is calculated from the charging schedule in the relevant EDP.

### Inflation-adjusted nature restoration levy amount: ${levyAmountInflationAdjusted} (plus VAT)

${INFLATION_ADJUSTED_PARAGRAPH}`
}

/**
 * @param {{ nrfServiceUrl: string, requestToUseLink: string }} params
 * @returns {string}
 */
const nextStepsSection = ({ nrfServiceUrl, requestToUseLink }) => `## Next steps

You do not need to pay anything now, this service is designed to help you plan how to meet your environmental obligations. You can [get another quote](${nrfServiceUrl}) at any time.

Keep this email for your records.

When you are ready to start the planning and development process, you can [request to use the nature restoration levy](${requestToUseLink}). Once your request is accepted, you will receive a commitment certificate. You can submit this alongside your planning application.`

/**
 * Builds the whole quote email as Notify Markdown, with every value resolved.
 * It is sent through a Notify template that only passes the subject and content
 * through, so the copy only ever changes with a backend deploy.
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
}) => ({
  subject: QUOTE_EMAIL_TITLE,
  content: [
    introductionSection({ nrfQuoteReference, nrfServiceUrl }),
    developmentDetailsSection({ planningType, housingUnits }),
    levySection({ edps }),
    nextStepsSection({ nrfServiceUrl, requestToUseLink }),
    HOW_THE_LEVY_WAS_CALCULATED_SECTION,
    WHAT_THE_LEVY_PAYS_FOR_SECTION,
    GET_HELP_SECTION,
    FEEDBACK_SECTION
  ].join('\n\n')
})
