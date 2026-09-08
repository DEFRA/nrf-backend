// Production eligibility gating — the environment has to be set before any
// config-reading app module loads, so those imports are dynamic and follow
// the env assignments below (static imports are hoisted above them).
const originalEnvironment = process.env.ENVIRONMENT
const originalPatterns = process.env.QUOTE_DELETE_ELIGIBLE_EMAIL_PATTERNS

process.env.ENVIRONMENT = 'prod'
process.env.QUOTE_DELETE_ELIGIBLE_EMAIL_PATTERNS =
  '@equalexperts.com,tester@hyperact.co.uk'

import { statusCodes } from '../../common/constants/status-codes.js'

const { setupTestServer } =
  await import('../../test-utils/setup-test-server.js')
const { routePath } = await import('../../routes/quote.js')
const { createQuote, sendDeleteRequest, sendGetRequest } =
  await import('../../test-utils/quote-request-helpers.js')

vi.mock('@defra/cdp-auditing')
vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

// Vitest reuses worker processes across test files — restore the environment
// so 'prod' does not leak into whichever sibling runs next in this worker.
afterAll(() => {
  if (originalEnvironment === undefined) {
    delete process.env.ENVIRONMENT
  } else {
    process.env.ENVIRONMENT = originalEnvironment
  }

  if (originalPatterns === undefined) {
    delete process.env.QUOTE_DELETE_ELIGIBLE_EMAIL_PATTERNS
  } else {
    process.env.QUOTE_DELETE_ELIGIBLE_EMAIL_PATTERNS = originalPatterns
  }
})

describe('Delete quote endpoint in production', () => {
  const getServer = setupTestServer()

  it('deletes a quote created with an approved email domain', async () => {
    const server = getServer()
    const postResponse = await createQuote(server, {
      email: 'ci-bot@equalexperts.com'
    })
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendDeleteRequest({ server, reference })

    expect(response.statusCode).toBe(statusCodes.noContent)

    // The quote endpoint reports a missing quote as 200 + accessStatus
    // rather than a bare 404
    const getResponse = await sendGetRequest({ server, reference })
    const { accessStatus, quote } = JSON.parse(getResponse.payload)

    expect(accessStatus).toBe('not_found')
    expect(quote).toBeNull()
  })

  it('refuses to delete a quote created with an unapproved email', async () => {
    const server = getServer()
    const postResponse = await createQuote(server, {
      email: 'developer@housebuilder.com'
    })
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendDeleteRequest({ server, reference })

    expect(response.statusCode).toBe(statusCodes.forbidden)
    const { rowCount } = await server.pg.query(
      'SELECT 1 FROM quotes WHERE reference = $1',
      [reference]
    )
    expect(rowCount).toBe(1)
  })

  it('only marks approved quotes as deletable in the list', async () => {
    const server = getServer()
    const approved = await createQuote(server, {
      email: 'ci-bot@equalexperts.com'
    })
    const unapproved = await createQuote(server, {
      email: 'developer@housebuilder.com'
    })
    const { reference: approvedReference } = JSON.parse(approved.payload)
    const { reference: unapprovedReference } = JSON.parse(unapproved.payload)

    const listResponse = await server.inject({ method: 'GET', url: routePath })
    const quotes = JSON.parse(listResponse.payload)

    expect(
      quotes.find((item) => item.reference === approvedReference).deleteEligible
    ).toBe(true)
    expect(
      quotes.find((item) => item.reference === unapprovedReference)
        .deleteEligible
    ).toBe(false)
  })
})
