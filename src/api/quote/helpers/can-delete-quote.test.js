import { canDeleteQuote } from './can-delete-quote.js'

describe('canDeleteQuote', () => {
  it.each([
    { email: 'developer@housebuilder.com', patterns: [] },
    { email: null, patterns: [] },
    { email: 'anything@example.com', patterns: ['@equalexperts.com'] }
  ])(
    'allows deleting a quote created by $email outside production',
    ({ email, patterns }) => {
      expect(canDeleteQuote({ email, patterns, isProd: false })).toBe(true)
    }
  )

  it.each([
    { email: 'ci-bot@equalexperts.com', patterns: ['@equalexperts.com'] },
    { email: 'CI-Bot@EqualExperts.com', patterns: ['@equalexperts.com'] },
    { email: 'ci-bot@equalexperts.com', patterns: ['@EQUALEXPERTS.com'] },
    { email: 'tester@hyperact.co.uk', patterns: ['tester@hyperact.co.uk'] },
    {
      email: 'someone@equalexperts.com',
      patterns: ['tester@hyperact.co.uk', '@equalexperts.com']
    },
    { email: 'ci-bot@equalexperts.com', patterns: [' @equalexperts.com '] }
  ])(
    'allows deleting a quote created by $email in production',
    ({ email, patterns }) => {
      expect(canDeleteQuote({ email, patterns, isProd: true })).toBe(true)
    }
  )

  it.each([
    { email: 'developer@housebuilder.com', patterns: ['@equalexperts.com'] },
    { email: 'x@not-equalexperts.com', patterns: ['@equalexperts.com'] },
    { email: null, patterns: ['@equalexperts.com'] },
    { email: 'ci-bot@equalexperts.com', patterns: [] },
    { email: 'ci-bot@equalexperts.com', patterns: ['  '] }
  ])(
    'refuses to delete a quote created by $email in production',
    ({ email, patterns }) => {
      expect(canDeleteQuote({ email, patterns, isProd: true })).toBe(false)
    }
  )
})
