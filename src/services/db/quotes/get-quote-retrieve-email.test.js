import { dbGetQuote } from './get-quote.js'
import { setupTestServer } from '../../../test-utils/setup-test-server.js'
import {
  createQuote,
  getQuoteId,
  insertEmailNotification
} from '../../../test-utils/quote-request-helpers.js'

vi.mock('../../sns/publish-event.js')

describe('dbGetQuote with a retrieve quote email', () => {
  const getServer = setupTestServer()

  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000)

  it('keeps the quote email as the headline email but lists both emails', async () => {
    const { reference } = JSON.parse((await createQuote(getServer())).payload)
    const quoteId = await getQuoteId({ server: getServer(), reference })
    await insertEmailNotification({
      server: getServer(),
      quoteId,
      emailType: 'quote_results',
      createdAt: minutesAgo(30)
    })
    await insertEmailNotification({
      server: getServer(),
      quoteId,
      emailType: 'retrieve_quote_link',
      createdAt: minutesAgo(10)
    })

    const quote = await dbGetQuote({ db: getServer().pg, reference })

    expect(quote.email.emailType).toBe('quote_results')
    expect(quote.emailNotifications.map((n) => n.emailType)).toEqual([
      'quote_results',
      'retrieve_quote_link'
    ])
  })
})
