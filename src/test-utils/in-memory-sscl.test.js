import { isNoSuchFileError } from '../common/helpers/sscl/sscl-errors.js'
import {
  fakeSsclSecondReplyFilename,
  fakeSsclStartupReplyFilename
} from './fixtures/sscl.js'
import { createInMemorySsclClient } from './in-memory-sscl.js'
import { collectPulledFiles, pulledStatuses } from './sscl-test-helpers.js'

const unsafe = '../escape.pgp'

describe('createInMemorySsclClient transport', () => {
  let transport

  beforeAll(async () => {
    ;({
      sscl: { transport }
    } = await createInMemorySsclClient())
  })

  it('fails a download of a missing file with the SFTP no-such-file code', async () => {
    const download = transport.withPullSession((session) =>
      session.download({ filename: 'missing.pgp', maxBytes: 100 })
    )

    await expect(download).rejects.toMatchObject({ code: 2 })
    await expect(download).rejects.toSatisfy(isNoSuchFileError)
  })

  it.each([
    [
      'push',
      () => transport.pushFile({ filename: unsafe, data: Buffer.from('x') })
    ],
    [
      'stat',
      () => transport.withPullSession((session) => session.stat(unsafe))
    ],
    [
      'download',
      () =>
        transport.withPullSession((session) =>
          session.download({ filename: unsafe, maxBytes: 100 })
        )
    ],
    [
      'remove',
      () => transport.withPullSession((session) => session.remove(unsafe))
    ]
  ])(
    'refuses an unsafe name on %s, as the SFTP transport does',
    async (_operation, run) => {
      await expect(run()).rejects.toMatchObject({
        code: 'SSCL_INVALID_FILENAME'
      })
    }
  )
})

describe('createInMemorySsclClient second reply', () => {
  let sscl
  let client

  beforeEach(async () => {
    ;({ sscl, client } = await createInMemorySsclClient())
  })

  it('gives the name of the second reply and the names in the pull folder as listed', async () => {
    expect(await sscl.dropSecondReply()).toEqual({
      filename: fakeSsclSecondReplyFilename,
      names: [fakeSsclSecondReplyFilename, fakeSsclStartupReplyFilename]
    })
  })

  it('drops a second reply that the client can receive', async () => {
    await sscl.dropSecondReply()

    const result = await client.pullFiles(collectPulledFiles())

    expect(pulledStatuses(result)).toEqual([
      [fakeSsclSecondReplyFilename, 'received'],
      [fakeSsclStartupReplyFilename, 'received']
    ])
  })
})
