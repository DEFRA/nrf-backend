/**
 * The quote email's subject line.
 */
export const QUOTE_EMAIL_SUBJECT = 'Nature restoration levy – quote'

/**
 * The whole quote email body in the notation of the Notify template it
 * replaces: the same Markdown and the same ((placeholders)), filled in by
 * buildQuoteEmailContent. Kept as one string so it can be compared line for
 * line with a Notify template or the prototype.
 *
 * Non-breaking spaces from the Notify template are written as escapes so they
 * stay visible.
 */
export const QUOTE_EMAIL_TEMPLATE = `# Nature restoration levy – quote

## NRL reference: ((nrfQuoteReference))

Thank you for submitting details of the relevant development on [Get a quote for the nature restoration levy](((nrfServiceUrl))).

This is an indicative nature restoration levy quote, based on the details you provided. For the purposes of section 72 of the Planning and Infrastructure Act 2025, this quote\u00A0does not commit you to pay the nature restoration levy and does not disapply any relevant environmental obligations. A Local Planning Authority must not accept this quote as part of any planning and decision-making processes.

## Details of your relevant development

You told us the relevant development\u00A0is planned to have:
- ((planningType))
- housing with a total of ((housingUnits)) unit(s)

## What you might need to pay

Your relevant development is planned in ((edpNames)).

### Provisional nature restoration levy amount: ((levyAmount)) (plus VAT)

The amount is calculated from the charging schedule in the relevant EDP.

### Inflation-adjusted nature restoration levy amount: ((levyAmountInflationAdjusted)) (plus VAT)

This shows the indicative levy amount for the year the quote was issued. The amount includes annual inflation in line with the Royal Institute of Chartered Surveyors (RICS) Community Infrastructure Levy (CIL) Index, published on 1 November and applied on 1 January for the following calendar year. This quote is indicative and subject to annual inflation. It shows the amount you may need to pay if you request to use the nature restoration levy.

## Next steps

You do not need to pay anything now, this service is designed to help you plan how to meet your environmental obligations. You can [get another quote](((nrfServiceUrl))) at any time.

Keep this email for your records.

When you are ready to start the planning and development process, you can [request to use the nature restoration levy](((requestToUseLink))). Once your request is accepted, you will receive a commitment certificate. You can submit this alongside your planning application.

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
