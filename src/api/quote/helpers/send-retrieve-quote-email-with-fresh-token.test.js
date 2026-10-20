import { sendRetrieveQuoteEmailWithFreshToken } from './send-retrieve-quote-email-with-fresh-token.js'
import { hashToken } from '../../../common/helpers/token/hash-token.js'
import { dbIssueQuoteAccessToken } from '../../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { sendRetrieveQuoteEmail } from './send-retrieve-quote-email.js'
import { config } from '../../../config.js'

vi.mock('../../../services/db/quote-access-tokens/issue-quote-access-token.js')
vi.mock('./send-retrieve-quote-email.js')

const quote = {
  id: 42,
  reference: 'NRL-000042',
  email: { address: 'adeola@example.com' }
}

describe('sendRetrieveQuoteEmailWithFreshToken', () => {
  beforeEach(() => {
    dbIssueQuoteAccessToken.mockResolvedValue(undefined)
    sendRetrieveQuoteEmail.mockResolvedValue({
      notificationId: 'notify-id',
      sentDateTime: '2026-08-18T00:00:00.000Z'
    })
  })

  it('issues a fresh single-use token and sends the magic link built from its raw value', async () => {
    // generateToken is NOT mocked: its output feeds hashToken and the emailed
    // URL, and asserting they carry the same raw token proves the link and the
    // stored hash belong to one freshly generated token.
    await sendRetrieveQuoteEmailWithFreshToken({ db: {}, quote })

    const sendArgs = sendRetrieveQuoteEmail.mock.calls[0][0]
    const rawFromUrl = sendArgs.retrieveQuoteUrl.match(
      new RegExp(
        `${config.get('frontEndBaseUrl')}/request-to-use/retrieve/NRL-000042/(.+)$`
      )
    )[1]

    expect(dbIssueQuoteAccessToken).toHaveBeenCalledTimes(1)
    expect(dbIssueQuoteAccessToken).toHaveBeenCalledWith({
      db: {},
      quoteId: 42,
      tokenHash: hashToken(rawFromUrl)
    })
    expect(sendRetrieveQuoteEmail).toHaveBeenCalledWith({
      recipientEmailAddress: 'adeola@example.com',
      retrieveQuoteUrl: expect.stringMatching(
        /\/request-to-use\/retrieve\/NRL-000042\//
      )
    })
  })

  it('issues a different token on each call, expiring any earlier live one', async () => {
    await sendRetrieveQuoteEmailWithFreshToken({ db: {}, quote })
    await sendRetrieveQuoteEmailWithFreshToken({ db: {}, quote })

    const firstSend = sendRetrieveQuoteEmail.mock.calls[0][0]
    const secondSend = sendRetrieveQuoteEmail.mock.calls[1][0]
    expect(firstSend.retrieveQuoteUrl).not.toBe(secondSend.retrieveQuoteUrl)
  })

  it('returns the result of the send, including null when Notify rejected it', async () => {
    sendRetrieveQuoteEmail.mockResolvedValueOnce(null)

    const result = await sendRetrieveQuoteEmailWithFreshToken({ db: {}, quote })

    expect(result).toBeNull()
  })
})
