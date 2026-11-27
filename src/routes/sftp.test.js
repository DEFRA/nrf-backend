import { createLogger } from '../common/helpers/logging/logger.js'
import { config } from '../config.js'
import { resetSsclClient } from '../services/sftp/get-sscl-client.js'
import { setupTestServer } from '../test-utils/setup-test-server.js'
import { generatePgpTestKeys } from '../test-utils/pgp-test-keys.js'
import { buildReply, fakeSsclKeysFor } from '../test-utils/fake-sscl.js'
import { receiveAsFakeSscl } from '../test-utils/fake-sscl-test-helpers.js'
import {
  fakeSsclReplyTime,
  fakeSsclStartupReplyFilename
} from '../test-utils/fixtures/sscl.js'
import { ssclTestLimits } from '../test-utils/sscl-test-helpers.js'
import {
  asSftpTestUser,
  clearSftpTestFolders,
  loadSftpTestServerConfig,
  namesInSftpTestFolder,
  putInSftpTestFolder,
  sftpRouteTestFolders as folders,
  sftpTestHookTimeoutMs,
  sftpTestUsers
} from '../test-utils/sftp-test-server.js'

const testEnabledSetting = 'sscl.testEnabled'
// Each request opens a push and a pull session, which is slow where the
// SFTP image runs emulated.
const routeTestTimeoutMs = 30000

/** @param {object} [options] */
const postTestFile = (options) => ({
  method: 'POST',
  url: '/sftp/test-file',
  ...options
})

describe('POST /sftp/test-file', { timeout: routeTestTimeoutMs }, () => {
  const original = config.get('sscl')
  let keys

  beforeAll(async () => {
    keys = await generatePgpTestKeys()
    loadSftpTestServerConfig({ keys, folders })
    config.set(testEnabledSetting, true)
    resetSsclClient()
  })

  afterAll(() => {
    config.load({ sscl: original })
    resetSsclClient()
  })

  beforeEach(async () => {
    await clearSftpTestFolders({ folders })
  }, sftpTestHookTimeoutMs)

  const getServer = setupTestServer()

  it('logs a connection as the push user and as the pull user', async () => {
    const info = vi.spyOn(createLogger(), 'info')

    await getServer().inject(postTestFile())

    const connectedAs = info.mock.calls
      .filter(([, message]) => message === 'SFTP connected')
      .map(([context]) => context.sftp.username)
    expect(new Set(connectedAs)).toEqual(
      new Set([sftpTestUsers.push, sftpTestUsers.pull])
    )
  })

  it('pushes a test file SSCL accepts, lists it and pulls the reply waiting for NRF', async () => {
    const reply = await buildReply({
      about: 'startup',
      time: fakeSsclReplyTime,
      keys: fakeSsclKeysFor(keys),
      maxFileBytes: ssclTestLimits.maxFileBytes
    })
    await putInSftpTestFolder({ direction: 'pull', folders, ...reply })

    const response = await getServer().inject(postTestFile())

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body).toEqual({
      ok: true,
      pushed: {
        ok: true,
        filename: expect.stringMatching(/^rainv_NRLINV_\d{14}\.dat\.pgp$/)
      },
      pushFolder: { ok: true, files: expect.any(Array) },
      pulled: {
        ok: true,
        files: [
          expect.objectContaining({
            filename: fakeSsclStartupReplyFilename,
            status: 'received'
          })
        ],
        notProcessed: 0
      }
    })
    expect(body.pushFolder.files.map((file) => file.name)).toContain(
      body.pushed.filename
    )
    expect(await namesInSftpTestFolder({ direction: 'pull', folders })).toEqual(
      []
    )

    const pushed = await asSftpTestUser({
      direction: 'push',
      work: (session) =>
        session.download({
          folder: folders.push,
          filename: body.pushed.filename,
          maxBytes: ssclTestLimits.maxFileBytes
        })
    })
    const receipt = await receiveAsFakeSscl({
      filename: body.pushed.filename,
      data: pushed,
      keys: fakeSsclKeysFor(keys),
      maxFileBytes: ssclTestLimits.maxFileBytes
    })
    expect(receipt.problems).toEqual([])
  })

  it('refuses a wrong service API key', async () => {
    const response = await getServer().inject(
      postTestFile({ headers: { 'x-api-key': 'wrong' } })
    )

    expect(response.statusCode).toBe(401)
  })

  it('refuses a request with no service API key', async () => {
    const response = await getServer().injectWithoutApiKey(postTestFile())

    expect(response.statusCode).toBe(401)
  })

  it.each([
    ['an empty', {}],
    ['a', { filename: '../../etc/passwd' }]
  ])('refuses a request with %s JSON body', async (_case, payload) => {
    const response = await getServer().inject(postTestFile({ payload }))

    expect(response.statusCode).toBe(400)
  })

  describe('with a push folder that does not exist', () => {
    beforeAll(() => {
      loadSftpTestServerConfig({
        keys,
        folders: { push: '/Interfaces/DEF/Missing/NRLIn', pull: folders.pull }
      })
      config.set(testEnabledSetting, true)
      resetSsclClient()
    })

    afterAll(() => {
      loadSftpTestServerConfig({ keys, folders })
      config.set(testEnabledSetting, true)
      resetSsclClient()
    })

    it('reports a failed step as ok false with no detail of the error', async () => {
      const response = await getServer().inject(postTestFile())

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body).toMatchObject({
        ok: false,
        pushed: { ok: false },
        pushFolder: { ok: false }
      })
      expect(Object.keys(body.pushed)).toEqual(['ok'])
      expect(response.payload).not.toMatch(/Missing|No such file|Error/i)
    })
  })

  describe('with no SFTP host', () => {
    beforeAll(() => {
      config.set('sscl.sftp.host', '')
      resetSsclClient()
    })

    afterAll(() => {
      loadSftpTestServerConfig({ keys, folders })
      config.set(testEnabledSetting, true)
      resetSsclClient()
    })

    it('fails with a 500 that does not name the missing setting', async () => {
      const response = await getServer().inject(postTestFile())

      expect(response.statusCode).toBe(500)
      expect(response.payload).not.toMatch(/sscl|host/i)
    })
  })
})

describe('POST /sftp/test-file when switched off', () => {
  const getServer = setupTestServer()

  it('is not found', async () => {
    const response = await getServer().inject(postTestFile())

    expect(response.statusCode).toBe(404)
  })
})
