import { dbGetQuote } from './get-quote.js'
import { setupTestServer } from '../../../test-utils/setup-test-server.js'
import {
  createQuote,
  getQuoteId,
  insertEmailNotification,
  minutesAgo
} from '../../../test-utils/quote-request-helpers.js'
import {
  EMAIL_TYPE_QUOTE_RESULTS,
  EMAIL_TYPE_RETRIEVE_QUOTE_LINK
} from '../../../common/constants/email-type.js'

vi.mock('../../sns/publish-event.js')

describe('dbGetQuote with a retrieve quote email', () => {
  const getServer = setupTestServer()

  it('keeps the quote email as the headline email but lists both emails', async () => {
    const { reference } = JSON.parse((await createQuote(getServer())).payload)
    const quoteId = await getQuoteId({ server: getServer(), reference })
    await insertEmailNotification({
      server: getServer(),
      quoteId,
      emailType: EMAIL_TYPE_QUOTE_RESULTS,
      createdAt: minutesAgo(30)
    })
    await insertEmailNotification({
      server: getServer(),
      quoteId,
      emailType: EMAIL_TYPE_RETRIEVE_QUOTE_LINK,
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
