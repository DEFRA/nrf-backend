import { config } from '../../config.js'
import {
  assertSsclConfig,
  getSsclClient,
  resetSsclClient
} from './get-sscl-client.js'
import {
  loadMoveitTestConfig,
  loadUsableMoveitTestConfig,
  toBase64,
  wrapBase64
} from '../../test-utils/sscl-test-helpers.js'
import { generatePgpTestKeys } from '../../test-utils/pgp-test-keys.js'
import { startSftpFaultServer } from '../../test-utils/sftp-fault-server.js'
import { ssclErrorCodes } from '../../common/helpers/sscl/sscl-errors.js'
import { ssclTestInvoiceFilename } from '../../test-utils/fixtures/sscl.js'

const testEnabledKey = 'sscl.testEnabled'
// Long enough for the SSH handshake, which it limits too, and far short of
// the default, so only the configured value can end the stalled request.
const stallTimeoutMs = 1000

const requiredKeys = [
  'sscl.sftp.host',
  'sscl.sftp.hostKey',
  'sscl.sftp.privateKey',
  'sscl.sftp.pushUser',
  'sscl.sftp.pushFolder',
  'sscl.sftp.pullUser',
  'sscl.sftp.pullFolder',
  'sscl.pgp.nrfPrivateKey',
  'sscl.pgp.ssclEncryptionPublicKey',
  'sscl.pgp.ssclSigningPublicKey'
]

let keys

beforeAll(async () => {
  keys = await generatePgpTestKeys()
})

describe('getSsclClient', () => {
  const original = {
    sscl: config.get('sscl'),
    environment: config.get('cdpEnvironment')
  }

  afterEach(() => {
    config.load({ sscl: original.sscl })
    config.set('cdpEnvironment', original.environment)
    resetSsclClient()
  })

  it('builds the client once per backend instance', async () => {
    loadUsableMoveitTestConfig({ keys })

    const first = await getSsclClient()
    const second = await getSsclClient()

    expect(second).toBe(first)
  })

  it('gives the client the file size limit from config', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set('sscl.maxFileBytes', 10)

    const client = await getSsclClient()

    await expect(
      client.pushFile({
        filename: ssclTestInvoiceFilename,
        data: Buffer.from('more than ten bytes once encrypted')
      })
    ).rejects.toMatchObject({ code: ssclErrorCodes.pushTooLarge })
  })

  it('gives the SFTP client its time limit from config', async () => {
    const server = await startSftpFaultServer({ folders: ['/out'] })
    try {
      const { host, port, hostKey, privateKey } = server.settings()
      loadUsableMoveitTestConfig({ keys })
      config.load({
        sscl: {
          sftp: {
            host,
            port,
            hostKey: toBase64(hostKey),
            privateKey: toBase64(privateKey),
            timeoutMs: stallTimeoutMs
          }
        }
      })
      server.setFault(({ operation }) =>
        operation === 'readdir' ? { stall: true } : undefined
      )

      const client = await getSsclClient()

      await expect(client.listPushFolder()).rejects.toMatchObject({
        code: ssclErrorCodes.timeout,
        message: `SFTP list timed out after ${stallTimeoutMs}ms`
      })
    } finally {
      await server.close()
    }
  })

  it('refuses the test route in prod, even without the plugin', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledKey, true)
    config.set('cdpEnvironment', 'prod')

    await expect(getSsclClient()).rejects.toThrow(
      'SSCL_SFTP_TEST_ENABLED must not be true in prod'
    )
  })

  it.each(requiredKeys)(
    'refuses to connect to MOVEit when %s is not set',
    async (key) => {
      loadMoveitTestConfig()
      config.set(key, '')

      await expect(getSsclClient()).rejects.toThrow(`${key} is not set`)
    }
  )

  it('refuses a key that is not base64', async () => {
    loadMoveitTestConfig()
    config.set('sscl.sftp.hostKey', 'ssh-ed25519 AAAA host')

    await expect(getSsclClient()).rejects.toThrow(
      'sscl.sftp.hostKey is not valid base64'
    )
  })

  it.each([
    ['sscl.pgp.ssclSigningPublicKey'],
    ['sscl.pgp.ssclEncryptionPublicKey']
  ])("refuses %s set to NRF's own key", async (key) => {
    loadUsableMoveitTestConfig({ keys })
    config.set(key, toBase64(keys.nrf.publicKey))

    await expect(getSsclClient()).rejects.toThrow(
      "SSCL's PGP public keys must not be NRF's own key"
    )
  })

  it('accepts base64 wrapped over several lines', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(
      'sscl.pgp.ssclSigningPublicKey',
      wrapBase64({ base64: toBase64(keys.ssclSigning.publicKey) }).join('\n')
    )

    await expect(getSsclClient()).resolves.toBeDefined()
  })

  it('tries again after a build that failed, rather than keep the failure', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set('sscl.sftp.host', '')
    await expect(getSsclClient()).rejects.toThrow('sscl.sftp.host is not set')

    config.set('sscl.sftp.host', 'moveit.example')

    await expect(getSsclClient()).resolves.toBeDefined()
  })
})

describe('assertSsclConfig', () => {
  const original = config.get('sscl')
  const junk = toBase64('not a key at all')

  afterEach(() => {
    config.load({ sscl: original })
  })

  it('passes with usable MOVEit settings when the test route is on', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledKey, true)

    await expect(assertSsclConfig()).resolves.toBeUndefined()
  })

  it.each(requiredKeys)(
    'fails at startup when the test route is on and %s is not set',
    async (key) => {
      loadUsableMoveitTestConfig({ keys })
      config.set(testEnabledKey, true)
      config.set(key, '')

      await expect(assertSsclConfig()).rejects.toThrow(`${key} is not set`)
    }
  )

  it.each([
    ['sscl.sftp.hostKey', 'SFTP host key'],
    ['sscl.sftp.privateKey', 'SSH private key'],
    ['sscl.pgp.nrfPrivateKey', 'PGP key'],
    ['sscl.pgp.ssclEncryptionPublicKey', 'PGP key'],
    ['sscl.pgp.ssclSigningPublicKey', 'PGP key']
  ])(
    'fails at startup when %s cannot be read, without quoting it',
    async (key, what) => {
      loadUsableMoveitTestConfig({ keys })
      config.set(testEnabledKey, true)
      config.set(key, junk)

      const failure = assertSsclConfig()

      await expect(failure).rejects.toThrow(`${key} is not a valid ${what}`)
      await expect(failure).rejects.not.toThrow('not a key at all')
      await expect(failure).rejects.not.toThrow(junk)
    }
  )

  it("fails at startup when the passphrase does not open NRF's private key, without quoting it", async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledKey, true)
    config.set('sscl.pgp.nrfPassphrase', 'wrong passphrase')

    const failure = assertSsclConfig()

    await expect(failure).rejects.toThrow(
      'sscl.pgp.nrfPassphrase is not a valid passphrase for sscl.pgp.nrfPrivateKey'
    )
    await expect(failure).rejects.not.toThrow('wrong passphrase')
  })

  it('does not require the MOVEit settings when the test route is off', async () => {
    config.load({ sscl: { testEnabled: false } })

    await expect(assertSsclConfig()).resolves.toBeUndefined()
  })
})
