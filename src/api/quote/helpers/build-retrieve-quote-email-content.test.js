import {
  expectedRetrieveQuoteEmail,
  validRetrieveQuoteEmailInput
} from '../../../test-utils/fixtures/emails.js'
import { buildRetrieveQuoteEmailContent } from './build-retrieve-quote-email-content.js'

describe('buildRetrieveQuoteEmailContent', () => {
  it('has the retrieve your quote title as its subject and opening line', () => {
    const { subject, content } = buildRetrieveQuoteEmailContent(
      validRetrieveQuoteEmailInput
    )

    expect(subject).toBe(
      'Nature restoration levy – retrieve your quote details'
    )
    expect(content).toMatch(
      /^# Nature restoration levy – retrieve your quote details\n\n## NRL reference: NRL-000042\n\n/
    )
  })

  it('links to the magic link for the quote', () => {
    const { content } = buildRetrieveQuoteEmailContent(
      validRetrieveQuoteEmailInput
    )

    expect(content).toContain(
      '[Retrieve the quote details](http://localhost:3000/request-to-use/retrieve/NRL-000042/abc123token).'
    )
  })

  it('ends with the get help section and has no feedback link', () => {
    const { content } = buildRetrieveQuoteEmailContent(
      validRetrieveQuoteEmailInput
    )

    expect(content).toContain('## Get help with the nature restoration levy')
    expect(content).toMatch(
      /\[Find out about call charges \(opens in new tab\)\]\(https:\/\/\S+\)$/
    )
    expect(content).not.toContain('What do you think of this service')
  })

  it('is exactly the recorded email', () => {
    expect(
      buildRetrieveQuoteEmailContent(validRetrieveQuoteEmailInput)
    ).toEqual(expectedRetrieveQuoteEmail)
  })
})
