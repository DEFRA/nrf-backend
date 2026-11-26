import { runSsclTestExchange } from './test-exchange.js'
import {
  sftpNoSuchFile,
  ssclErrorCodes
} from '../../common/helpers/sscl/sscl-errors.js'
import {
  overridePullSession,
  withCode
} from '../../test-utils/sscl-test-helpers.js'
import { createInMemorySsclClient } from '../../test-utils/in-memory-sscl.js'
import {
  fakeSsclStartupReplyFilename as replyFilename,
  ssclTestInvoiceFilename as testFilename
} from '../../test-utils/fixtures/sscl.js'

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}))
vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const now = new Date('2026-11-09T17:30:05Z')

describe('runSsclTestExchange', () => {
  let sscl
  let client

  beforeEach(async () => {
    ;({ sscl, client } = await createInMemorySsclClient())
  })

  it('pushes the test file, lists it, and pulls and removes the reply', async () => {
    const result = await runSsclTestExchange({ client, now })

    expect(result).toEqual({
      ok: true,
      pushed: { ok: true, filename: testFilename },
      pushFolder: {
        ok: true,
        files: [
          {
            name: testFilename,
            size: expect.any(Number),
            modifyTime: expect.any(Number)
          }
        ]
      },
      pulled: {
        ok: true,
        files: [
          expect.objectContaining({
            filename: replyFilename,
            status: 'received'
          })
        ],
        notProcessed: 0
      }
    })
  })

  it('pushes under the next second when the name is already taken', async () => {
    await runSsclTestExchange({ client, now })

    const result = await runSsclTestExchange({ client, now })

    expect(result.pushed).toEqual({
      ok: true,
      filename: 'rainv_NRLINV_20261109173006.dat.pgp'
    })
  })

  it('reports the push as failed when the next second is taken too', async () => {
    await runSsclTestExchange({ client, now })
    await runSsclTestExchange({ client, now })

    const result = await runSsclTestExchange({ client, now })

    expect(result.pushed).toEqual({ ok: false })
    expect(result.ok).toBe(false)
  })

  it.each([
    ['received', true],
    ['gone', true],
    ['too-large', false],
    ['download-failed', false],
    ['changed', false],
    ['unverified', false],
    ['not-stored', false],
    ['replaced', false],
    ['not-deleted', false]
  ])('treats a pulled file that is %s as ok: %s', async (status, ok) => {
    client.pullFiles = async () => ({
      files: [{ filename: replyFilename, size: 1, status }],
      notProcessed: 0
    })

    const result = await runSsclTestExchange({ client, now })

    expect(result.pulled.ok).toBe(ok)
    expect(result.ok).toBe(ok)
  })

  it('is still ok when files are left for a later pull', async () => {
    client.pullFiles = async () => ({ files: [], notProcessed: 3 })

    const result = await runSsclTestExchange({ client, now })

    expect(result.ok).toBe(true)
    expect(result.pulled).toEqual({ ok: true, files: [], notProcessed: 3 })
  })

  it('carries on with the other steps when pushing fails, without exposing the error', async () => {
    const error = new Error('connect ECONNREFUSED 10.0.0.1:3128')
    sscl.transport.pushFile = () => Promise.reject(error)

    const result = await runSsclTestExchange({ client, now })

    expect(result.ok).toBe(false)
    expect(result.pushed).toEqual({ ok: false })
    expect(result.pulled.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED')
    expect(mockLogger.error).toHaveBeenCalledWith(
      error,
      'SSCL test exchange push step failed'
    )
  })

  it('is not ok when a pulled file is left in the pull folder', async () => {
    overridePullSession({
      transport: sscl.transport,
      overrides: { remove: () => Promise.reject(new Error('denied')) }
    })

    const result = await runSsclTestExchange({ client, now })

    expect(result.ok).toBe(false)
    expect(result.pulled).toEqual(
      expect.objectContaining({
        ok: false,
        files: [expect.objectContaining({ status: 'not-deleted' })]
      })
    )
  })

  it('is still ok when a file was gone before it could be pulled', async () => {
    overridePullSession({
      transport: sscl.transport,
      overrides: {
        download: () => Promise.reject(withCode(sftpNoSuchFile))
      }
    })

    const result = await runSsclTestExchange({ client, now })

    expect(result.ok).toBe(true)
    expect(result.pulled).toEqual(
      expect.objectContaining({
        ok: true,
        files: [expect.objectContaining({ status: 'gone' })]
      })
    )
  })

  it('is not ok when another pull is already running', async () => {
    client.pullFiles = () =>
      Promise.reject(withCode(ssclErrorCodes.pullInProgress))

    const result = await runSsclTestExchange({ client, now })

    expect(result.pulled).toEqual({ ok: false })
  })

  it('logs each pulled file and discards its content', async () => {
    await runSsclTestExchange({ client, now })

    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        sscl: {
          filename: replyFilename,
          decryptedSize: expect.any(Number),
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/)
        }
      },
      'SSCL test exchange pulled file, content discarded'
    )
  })
})
