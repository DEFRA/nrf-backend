import { routePath } from '../../routes/quote.js'
import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

vi.mock('../../services/send-email/notify-client.js')

const sendPostRequest = ({ server, payload }) => {
  return server.inject({
    method: 'POST',
    url: routePath,
    payload
  })
}

describe('Submit quote endpoint', () => {
  const getServer = setupTestServer()

  it('should return 201', async () => {
    const response = await sendPostRequest({
      server: getServer(),
      payload: {
        emailAddress: 'developer@housebuilder.com'
      }
    })
    expect(response.statusCode).toBe(201)
  })

  it('should send a quote email', async () => {
    const notifySendEmail = vi.fn()
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: notifySendEmail
    })
    await sendPostRequest({
      server: getServer(),
      payload: {
        emailAddress: 'developer@housebuilder.com'
      },
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    expect(notifySendEmail).toHaveBeenCalled()
  })

  it('should return 400 if emailAddress is missing', async () => {
    const response = await sendPostRequest({
      server: getServer(),
      payload: {}
    })
    expect(response.statusCode).toBe(400)
  })
})
