import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  sendDeleteRequest,
  getQuoteId,
  issueAccessToken,
  insertEmailNotification
} from '../../test-utils/quote-request-helpers.js'
import { routePath } from '../../routes/quote.js'

vi.mock('@defra/cdp-auditing')
vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

describe('Delete quote endpoint', () => {
  const getServer = setupTestServer()

  it('deletes the quote and all joined records', async () => {
    const server = getServer()
    const postResponse = await createQuote(server)
    const { reference } = JSON.parse(postResponse.payload)
    const quoteId = await getQuoteId({ server, reference })

    await issueAccessToken({ server, reference })
    await insertEmailNotification({
      server,
      quoteId,
      emailType: 'quote_result'
    })

    const response = await sendDeleteRequest({ server, reference })

    expect(response.statusCode).toBe(statusCodes.noContent)

    const [quotes, edps, tokens, notifications] = await Promise.all([
      server.pg.query('SELECT 1 FROM quotes WHERE id = $1', [quoteId]),
      server.pg.query('SELECT 1 FROM quote_edp_results WHERE quote_id = $1', [
        quoteId
      ]),
      server.pg.query('SELECT 1 FROM quote_access_tokens WHERE quote_id = $1', [
        quoteId
      ]),
      server.pg.query(
        'SELECT 1 FROM quote_email_notifications WHERE quote_id = $1',
        [quoteId]
      )
    ])

    expect(quotes.rowCount).toBe(0)
    expect(edps.rowCount).toBe(0)
    expect(tokens.rowCount).toBe(0)
    expect(notifications.rowCount).toBe(0)
  })

  it('returns 404 when the quote does not exist', async () => {
    const response = await sendDeleteRequest({
      server: getServer(),
      reference: 'NRL-999999'
    })

    expect(response.statusCode).toBe(statusCodes.notFound)
  })

  it('returns 400 when the reference format is invalid', async () => {
    const response = await sendDeleteRequest({
      server: getServer(),
      reference: 'not-a-reference'
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })

  it('marks the quote as deletable in the list outside production', async () => {
    const server = getServer()
    const postResponse = await createQuote(server)
    const { reference } = JSON.parse(postResponse.payload)

    const listResponse = await server.inject({ method: 'GET', url: routePath })
    const quotes = JSON.parse(listResponse.payload)
    const quote = quotes.find((item) => item.reference === reference)

    expect(quote.deleteEligible).toBe(true)
  })
})
