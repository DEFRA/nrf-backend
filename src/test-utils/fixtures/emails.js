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

/**
 * The whole quote email for `validQuoteEmailInput`, as the user receives it.
 * The copy was lifted unchanged from the Notify template this code replaced,
 * so change it only together with a deliberate change to that copy.
 */
export const expectedQuoteEmail = {
  subject: 'Nature restoration levy – quote',
  content: `# Nature restoration levy – quote

## NRL reference: NRL-000042

Thank you for submitting details of the relevant development on [Get a quote for the nature restoration levy](http://localhost:3000).

This is an indicative nature restoration levy quote, based on the details you provided. For the purposes of section 72 of the Planning and Infrastructure Act 2025, this quote\u00A0does not commit you to pay the nature restoration levy and does not disapply any relevant environmental obligations. A Local Planning Authority must not accept this quote as part of any planning and decision-making processes.

## Details of your relevant development

You told us the relevant development\u00A0is planned to have:
- full planning permission
- housing with a total of 10 unit(s)

## What you might need to pay

Your relevant development is planned in Norfolk Fens east.

### Provisional nature restoration levy amount: £1,100 (plus VAT)

The amount is calculated from the charging schedule in the relevant EDP.

### Inflation-adjusted nature restoration levy amount: £1,122 (plus VAT)

This shows the indicative levy amount for the year the quote was issued. The amount includes annual inflation in line with the Royal Institute of Chartered Surveyors (RICS) Community Infrastructure Levy (CIL) Index, published on 1 November and applied on 1 January for the following calendar year. This quote is indicative and subject to annual inflation. It shows the amount you may need to pay if you request to use the nature restoration levy.

## Next steps

You do not need to pay anything now, this service is designed to help you plan how to meet your environmental obligations. You can [get another quote](http://localhost:3000) at any time.

Keep this email for your records.

When you are ready to start the planning and development process, you can [request to use the nature restoration levy](http://localhost:3000/request-to-use/enter-nrl-reference?nrlReference=NRL-000042). Once your request is accepted, you will receive a commitment certificate. You can submit this alongside your planning application.

## How your nature restoration levy was calculated

Your levy has been calculated from the details you submitted and the charging schedule for the EDP. [Read about the charging schedule for the EDP](#).

## What your levy will pay for

Your levy will fund conservation measures delivered under the relevant EDPs, including their long-term management,\u00A0monitoring\u00A0and maintenance\u00A0as well as administration costs. EDPs set out measures needed to address the environmental impacts of development in an area and deliver an overall improvement in the conservation status of the environmental feature set out in the EDP.

## Get help with the nature restoration levy

If you need help with the nature restoration levy, contact Natural England.

Email: [enquiries@naturalengland.org.uk](mailto:enquiries@naturalengland.org.uk)

Telephone: 0300 060 3900

Monday to Friday, 10am to 4pm, except bank holidays

[Find out about call charges (opens in new tab)](https://www.gov.uk/call-charges)

[What do you think of this service? (opens in new tab)](https://defragroup.eu.qualtrics.com/jfe/form/SV_9yRhrdtbb3vmw86?Journey=Quote) (takes 30 seconds)`
}

/**
 * The whole retrieve your quote email for `validRetrieveQuoteEmailInput`, as
 * the user receives it. Change it only together with a deliberate change to
 * that copy.
 */
export const expectedRetrieveQuoteEmail = {
  subject: 'Nature restoration levy – retrieve your quote details',
  content: `# Nature restoration levy – retrieve your quote details

## NRL reference: NRL-000042

Retrieve the details you previously gave us for your quote. Use them to provide the information needed to request to use the nature restoration levy.

[Retrieve the quote details](http://localhost:3000/request-to-use/retrieve/NRL-000042/abc123token).

## Get help with the nature restoration levy

If you need help with the nature restoration levy, contact Natural England.

Email: [enquiries@naturalengland.org.uk](mailto:enquiries@naturalengland.org.uk)

Telephone: 0300 060 3900

Monday to Friday, 10am to 4pm, except bank holidays

[Find out about call charges (opens in new tab)](https://www.gov.uk/call-charges)`
}
