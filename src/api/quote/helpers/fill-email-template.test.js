import { fillEmailTemplate } from './fill-email-template.js'

describe('fillEmailTemplate', () => {
  it('replaces each Notify placeholder with its value', () => {
    expect(
      fillEmailTemplate({
        template:
          'Reference: ((reference))\n\nHousing: ((housingUnits)) unit(s)',
        values: { reference: 'NRL-000042', housingUnits: 10 }
      })
    ).toBe('Reference: NRL-000042\n\nHousing: 10 unit(s)')
  })

  it('fills a placeholder that is the target of a Markdown link, leaving the brackets around it', () => {
    expect(
      fillEmailTemplate({
        template: '[Get another quote](((serviceUrl))) at any time.',
        values: { serviceUrl: 'http://localhost:3000' }
      })
    ).toBe('[Get another quote](http://localhost:3000) at any time.')
  })

  it('does not treat a placeholder written inside a value as one to fill', () => {
    expect(
      fillEmailTemplate({
        template: 'Hello ((name))',
        values: { name: '((notAPlaceholder))' }
      })
    ).toBe('Hello ((notAPlaceholder))')
  })

  it('leaves a template without placeholders as it is', () => {
    expect(
      fillEmailTemplate({ template: 'No placeholders here', values: {} })
    ).toBe('No placeholders here')
  })
})
