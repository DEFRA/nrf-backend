import { createLogger } from '../common/helpers/logging/logger.js'
import { config } from '../config.js'
import { resetSsclClient } from '../services/sftp/get-sscl-client.js'
import { setupTestServer } from '../test-utils/setup-test-server.js'
import { generatePgpTestKeys } from '../test-utils/pgp-test-keys.js'
import {
  buildReply,
  fakeSsclKeysFor,
  receivePushedFile
} from '../test-utils/fake-sscl.js'
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

const testFilePath = '/sftp/test-file'

describe('POST /sftp/test-file', { timeout: 30000 }, () => {
  const original = config.get('sscl')
  let keys

  beforeAll(async () => {
    keys = await generatePgpTestKeys()
    loadSftpTestServerConfig({ keys, folders })
    config.set('sscl.testEnabled', true)
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
    try {
      await getServer().inject({ method: 'POST', url: testFilePath })

      const connectedAs = info.mock.calls
        .filter(([, message]) => message === 'SFTP connected')
        .map(([context]) => context.sftp.username)
      expect(new Set(connectedAs)).toEqual(
        new Set([sftpTestUsers.push, sftpTestUsers.pull])
      )
    } finally {
      info.mockRestore()
    }
  })

  it('pushes a test file SSCL accepts, lists it and pulls the reply waiting for NRF', async () => {
    const reply = await buildReply({
      about: 'startup',
      time: fakeSsclReplyTime,
      keys: fakeSsclKeysFor(keys),
      maxFileBytes: ssclTestLimits.maxFileBytes
    })
    await putInSftpTestFolder({ direction: 'pull', folders, ...reply })

    const response = await getServer().inject({
      method: 'POST',
      url: testFilePath
    })

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
    const receipt = await receivePushedFile({
      filename: body.pushed.filename,
      data: pushed,
      keys: fakeSsclKeysFor(keys),
      maxFileBytes: ssclTestLimits.maxFileBytes,
      archivedNames: new Set()
    })
    expect(receipt.problems).toEqual([])
  })

  it.each([
    ['a wrong', { 'x-api-key': 'wrong' }],
    ['no', {}]
  ])('refuses %s service API key', async (_case, headers) => {
    const server = Object.getPrototypeOf(getServer())

    const response = await server.inject({
      method: 'POST',
      url: testFilePath,
      headers
    })

    expect(response.statusCode).toBe(401)
  })

  it('refuses a request with a body', async () => {
    const response = await getServer().inject({
      method: 'POST',
      url: testFilePath,
      payload: { filename: '../../etc/passwd' }
    })

    expect(response.statusCode).toBe(400)
  })

  it('reports a failed step as ok false with no detail of the error', async () => {
    loadSftpTestServerConfig({
      keys,
      folders: { push: '/Interfaces/DEF/Missing/NRLIn', pull: folders.pull }
    })
    config.set('sscl.testEnabled', true)
    resetSsclClient()
    try {
      const response = await getServer().inject({
        method: 'POST',
        url: testFilePath
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body).toMatchObject({
        ok: false,
        pushed: { ok: false },
        pushFolder: { ok: false }
      })
      expect(Object.keys(body.pushed)).toEqual(['ok'])
      expect(response.payload).not.toMatch(/Missing|No such file|Error/i)
    } finally {
      loadSftpTestServerConfig({ keys, folders })
      config.set('sscl.testEnabled', true)
      resetSsclClient()
    }
  })
})

describe('POST /sftp/test-file when switched off', () => {
  const getServer = setupTestServer()

  it('is not found', async () => {
    const response = await getServer().inject({
      method: 'POST',
      url: testFilePath
    })

    expect(response.statusCode).toBe(404)
  })
})
