import {
  edpWithLevy,
  expectedQuoteEmail,
  validQuoteEmailInput
} from '../../../test-utils/fixtures/emails.js'
import { buildQuoteEmailContent } from './build-quote-email-content.js'

const PROVISIONAL_LEVY_HEADING =
  '### Provisional nature restoration levy amount: '
const INFLATION_ADJUSTED_LEVY_HEADING =
  '### Inflation-adjusted nature restoration levy amount: '

describe('buildQuoteEmailContent', () => {
  it('has the quote email title as its subject and opening line', () => {
    const { subject, content } = buildQuoteEmailContent(validQuoteEmailInput)

    expect(subject).toBe('Nature restoration levy – quote')
    expect(content).toMatch(
      /^# Nature restoration levy – quote\n\n## NRL reference: NRL-000042\n\n/
    )
  })

  it.each([
    ['full-planning-permission', '- full planning permission'],
    ['outline-planning-permission', '- outline planning permission'],
    ['hybrid-planning-permission', '- hybrid planning permission']
  ])('lists the %s the development is planned as', (planningType, bullet) => {
    const { content } = buildQuoteEmailContent({
      ...validQuoteEmailInput,
      planningType
    })

    expect(content).toContain(bullet)
  })

  it('states the number of housing units the development is planned to have', () => {
    const { content } = buildQuoteEmailContent({
      ...validQuoteEmailInput,
      housingUnits: 25
    })

    expect(content).toContain('- housing with a total of 25 unit(s)')
  })

  it.each([
    [1100, 1122, '£1,100', '£1,122'],
    [1100, 1122.5, '£1,100', '£1,122.50'],
    [1100.25, 26750, '£1,100.25', '£26,750'],
    ['1000.00', '1122.50', '£1,000', '£1,122.50']
  ])(
    'shows levy amounts of %s and %s as %s and %s',
    (
      amountExcludingVat,
      amountInflationAdjusted,
      expectedLevy,
      expectedAdjusted
    ) => {
      const { content } = buildQuoteEmailContent({
        ...validQuoteEmailInput,
        edps: [
          edpWithLevy({
            edpName: 'Norfolk Fens east',
            amountExcludingVat,
            amountInflationAdjusted
          })
        ]
      })

      expect(content).toContain(
        `${PROVISIONAL_LEVY_HEADING}${expectedLevy} (plus VAT)`
      )
      expect(content).toContain(
        `${INFLATION_ADJUSTED_LEVY_HEADING}${expectedAdjusted} (plus VAT)`
      )
    }
  )

  it('names every EDP the development is planned in', () => {
    const { content } = buildQuoteEmailContent({
      ...validQuoteEmailInput,
      edps: ['One', 'Two'].map((edpName) =>
        edpWithLevy({
          edpName,
          amountExcludingVat: 1100,
          amountInflationAdjusted: 1122
        })
      )
    })

    expect(content).toContain(
      'Your relevant development is planned in One, Two.'
    )
  })

  it('links to the service and to the request to use journey with the reference filled in', () => {
    const { content } = buildQuoteEmailContent(validQuoteEmailInput)

    expect(content).toContain(
      '[Get a quote for the nature restoration levy](http://localhost:3000)'
    )
    expect(content).toContain('[get another quote](http://localhost:3000)')
    expect(content).toContain(
      '[request to use the nature restoration levy](http://localhost:3000/request-to-use/enter-nrl-reference?nrlReference=NRL-000042)'
    )
  })

  it('sets the sections out in order', () => {
    const { content } = buildQuoteEmailContent(validQuoteEmailInput)

    const positions = [
      '## NRL reference: ',
      '## Details of your relevant development',
      '## What you might need to pay',
      '## Next steps',
      '## How your nature restoration levy was calculated',
      '## What your levy will pay for',
      '## Get help with the nature restoration levy'
    ].map((heading) => content.indexOf(heading))

    expect(positions).not.toContain(-1)
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
  })

  it('ends by asking for feedback', () => {
    const { content } = buildQuoteEmailContent(validQuoteEmailInput)

    expect(content).toMatch(
      /\[What do you think of this service\? \(opens in new tab\)\]\(https:\/\/\S+\) \(takes 30 seconds\)$/
    )
  })

  it('is exactly the recorded email', () => {
    expect(buildQuoteEmailContent(validQuoteEmailInput)).toEqual(
      expectedQuoteEmail
    )
  })
})
