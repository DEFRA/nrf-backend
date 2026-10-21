import { sendRetrieveQuoteEmailWithFreshToken } from './send-retrieve-quote-email-with-fresh-token.js'
import { hashToken } from '../../../common/helpers/token/hash-token.js'
import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { config } from '../../../config.js'

vi.mock('../../../services/db/quote-access-tokens/issue-quote-access-token.js')
// The Notify boundary is mocked rather than the neighbouring
// send-retrieve-quote-email helper, so a break there (e.g. the wrong template
// or a missing URL variable) still fails this test.
vi.mock('../../../services/send-email/send-email-client.js')

const QUOTE_REFERENCE = 'NRL-000042'

const quote = {
  id: 42,
  reference: QUOTE_REFERENCE,
  email: { address: 'adeola@example.com' }
}

describe('sendRetrieveQuoteEmailWithFreshToken', () => {
  beforeEach(() => {
    dbIssueQuoteAccessToken.mockResolvedValue(undefined)
    sendEmail.mockResolvedValue({
      notificationId: 'notify-id',
      sentDateTime: '2026-08-18T00:00:00.000Z'
    })
  })

  it('issues a fresh single-use token and sends the magic link built from its raw value', async () => {
    // generateToken is NOT mocked: its output feeds hashToken and the emailed
    // URL, and asserting they carry the same raw token proves the link and the
    // stored hash belong to one freshly generated token.
    await sendRetrieveQuoteEmailWithFreshToken({ db: {}, quote })

    const sendArgs = sendEmail.mock.calls[0][0]
    const rawFromUrl = sendArgs.emailBodyVariables.retrieveQuoteUrl.match(
      new RegExp(
        `${config.get('frontEndBaseUrl')}/request-to-use/retrieve/${QUOTE_REFERENCE}/(.+)$`
      )
    )[1]

    expect(sendArgs.recipientEmailAddress).toBe('adeola@example.com')
    expect(sendArgs.templateId).toBe(
      config.get('notify').templateIds.retrieveQuote
    )
    expect(dbIssueQuoteAccessToken).toHaveBeenCalledTimes(1)
    expect(dbIssueQuoteAccessToken).toHaveBeenCalledWith({
      db: {},
      quoteId: 42,
      tokenHash: hashToken(rawFromUrl)
    })
    expect(sendArgs.emailBodyVariables.retrieveQuoteUrl).toEqual(
      expect.stringMatching(
        new RegExp(`/request-to-use/retrieve/${QUOTE_REFERENCE}/`)
      )
    )
  })

  it('issues a different token on each call, expiring any earlier live one', async () => {
    await sendRetrieveQuoteEmailWithFreshToken({ db: {}, quote })
    await sendRetrieveQuoteEmailWithFreshToken({ db: {}, quote })

    const [firstSend, secondSend] = sendEmail.mock.calls.map(
      (call) => call[0].emailBodyVariables.retrieveQuoteUrl
    )
    expect(firstSend).not.toBe(secondSend)
  })

  it('returns the result of the send, including null when Notify rejected it', async () => {
    sendEmail.mockResolvedValueOnce(null)

    const result = await sendRetrieveQuoteEmailWithFreshToken({ db: {}, quote })

    expect(result).toBeNull()
  })
})
