import {
  isNoSuchFileError,
  ssclErrorCodes
} from '../common/helpers/sscl/sscl-errors.js'
import { createInMemorySsclClient } from './in-memory-sscl.js'

const unsafe = '../escape.pgp'

describe('createInMemorySsclClient transport', () => {
  let transport

  beforeAll(async () => {
    ;({
      sscl: { transport }
    } = await createInMemorySsclClient())
  })

  const inPullSession = (work) => transport.withPullSession(work)

  it('fails a download of a missing file with the SFTP no-such-file code', async () => {
    await expect(
      inPullSession((session) =>
        session.download({ filename: 'missing.pgp', maxBytes: 100 })
      )
    ).rejects.toSatisfy(isNoSuchFileError)
  })

  it.each([
    [
      'push',
      () => transport.pushFile({ filename: unsafe, data: Buffer.from('x') })
    ],
    ['stat', () => inPullSession((session) => session.stat(unsafe))],
    [
      'download',
      () =>
        inPullSession((session) =>
          session.download({ filename: unsafe, maxBytes: 100 })
        )
    ],
    ['remove', () => inPullSession((session) => session.remove(unsafe))]
  ])(
    'refuses an unsafe name on %s, as the SFTP transport does',
    async (_operation, run) => {
      await expect(run()).rejects.toMatchObject({
        code: ssclErrorCodes.invalidFilename
      })
    }
  )
})
