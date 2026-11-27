import { config } from '../../config.js'
import {
  assertSsclConfig,
  getSsclClient,
  resetSsclClient
} from './get-sscl-client.js'
import { decryptAndVerify } from '../../common/helpers/sscl/pgp.js'
import {
  collectPulledFiles,
  loadFaultServerMoveitTestConfig,
  loadMoveitTestConfig,
  loadUsableMoveitTestConfig,
  moveitTestFolders,
  moveitTestUsers,
  ssclTestLimits,
  toBase64,
  wrapBase64
} from '../../test-utils/sscl-test-helpers.js'
import { sentBySscl } from '../../test-utils/fake-sscl-test-helpers.js'
import { generatePgpTestKeys } from '../../test-utils/pgp-test-keys.js'
import { startConnectProxy } from '../../test-utils/connect-proxy.js'
import { startSftpFaultServer } from '../../test-utils/sftp-fault-server.js'
import {
  ssclTestInvoiceFilename,
  ssclTestInvoiceText,
  ssclTestReplyFilename,
  ssclTestSecondReplyFilename
} from '../../test-utils/fixtures/sscl.js'

const testEnabledKey = 'sscl.testEnabled'
const environmentSetting = 'cdpEnvironment'
const hostSetting = 'sscl.sftp.host'
const hostKeySetting = 'sscl.sftp.hostKey'
const encryptionKeySetting = 'sscl.pgp.ssclEncryptionPublicKey'
const signingKeySetting = 'sscl.pgp.ssclSigningPublicKey'
const privateKeySetting = 'sscl.sftp.privateKey'
const nrfPrivateKeySetting = 'sscl.pgp.nrfPrivateKey'
const pgpPrivateKey = 'PGP private key'
const pgpPublicKey = 'PGP public key'
const { push: pushFolder, pull: pullFolder } = moveitTestFolders
// Long enough for the SSH handshake, which it limits too, and far short of
// the default, so only the configured value can end the stalled request.
const stallTimeoutMs = 1000

const requiredKeys = [
  hostSetting,
  hostKeySetting,
  privateKeySetting,
  'sscl.sftp.pushUser',
  'sscl.sftp.pushFolder',
  'sscl.sftp.pullUser',
  'sscl.sftp.pullFolder',
  nrfPrivateKeySetting,
  encryptionKeySetting,
  signingKeySetting
]

const base64Keys = [
  hostKeySetting,
  privateKeySetting,
  nrfPrivateKeySetting,
  encryptionKeySetting,
  signingKeySetting
]

let keys

beforeAll(async () => {
  keys = await generatePgpTestKeys()
})

const original = {
  sscl: config.get('sscl'),
  environment: config.get(environmentSetting),
  httpProxy: config.get('httpProxy')
}

afterEach(() => {
  config.load({ sscl: original.sscl })
  config.set(environmentSetting, original.environment)
  config.set('httpProxy', original.httpProxy)
  resetSsclClient()
})

describe('getSsclClient', () => {
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
    ).rejects.toMatchObject({ code: 'SSCL_PUSH_TOO_LARGE' })
  })

  it('gives the client the number of files to pull in one run from config', async () => {
    const server = await startSftpFaultServer({
      folders: [pushFolder, pullFolder]
    })
    try {
      loadFaultServerMoveitTestConfig({ server, keys })
      config.set('sscl.maxFilesPerRun', 1)
      for (const filename of [
        ssclTestReplyFilename,
        ssclTestSecondReplyFilename
      ]) {
        server.putFile({ folder: pullFolder, filename, data: Buffer.from('x') })
      }

      const client = await getSsclClient()
      const result = await client.pullFiles(collectPulledFiles())

      expect(result.files).toHaveLength(1)
      expect(result.notProcessed).toBe(1)
    } finally {
      await server.close()
    }
  })

  it('logs in as the push user to push and as the pull user to pull', async () => {
    const server = await startSftpFaultServer({
      folders: [pushFolder, pullFolder]
    })
    try {
      loadFaultServerMoveitTestConfig({ server, keys })

      const client = await getSsclClient()
      await client.listPushFolder()
      await client.pullFiles(collectPulledFiles())

      expect(server.logins()).toEqual([
        moveitTestUsers.push,
        moveitTestUsers.pull
      ])
    } finally {
      await server.close()
    }
  })

  it("encrypts to SSCL's encryption key and checks SSCL's signing key, as config gives them", async () => {
    const server = await startSftpFaultServer({
      folders: [pushFolder, pullFolder]
    })
    try {
      loadFaultServerMoveitTestConfig({ server, keys })
      server.putFile({
        folder: pullFolder,
        filename: ssclTestReplyFilename,
        data: await sentBySscl({ text: ssclTestInvoiceText, pgp: keys })
      })

      const client = await getSsclClient()
      await client.pushFile({
        filename: ssclTestInvoiceFilename,
        data: Buffer.from(ssclTestInvoiceText)
      })
      const pulled = await client.pullFiles(collectPulledFiles())

      const pushed = await decryptAndVerify({
        data: server.files.get(`${pushFolder}/${ssclTestInvoiceFilename}`).data,
        decryptionKey: keys.ssclEncryption.privateKey,
        passphrase: keys.ssclEncryption.passphrase,
        verificationKey: keys.nrf.publicKey,
        maxDecompressedBytes: ssclTestLimits.maxFileBytes
      })
      expect(pushed.toString()).toBe(ssclTestInvoiceText)
      expect(pulled.files).toEqual([
        expect.objectContaining({
          filename: ssclTestReplyFilename,
          status: 'received'
        })
      ])
    } finally {
      await server.close()
    }
  })

  it('connects through the HTTP proxy from config', async () => {
    const server = await startSftpFaultServer({ folders: [pushFolder] })
    const proxy = await startConnectProxy()
    try {
      const { host, port } = loadFaultServerMoveitTestConfig({ server, keys })
      config.set('httpProxy', proxy.url)

      const client = await getSsclClient()
      await client.listPushFolder()

      expect(proxy.targets).toEqual([`${host}:${port}`])
    } finally {
      await proxy.close()
      await server.close()
    }
  })

  it('gives the SFTP client its time limit from config', async () => {
    const server = await startSftpFaultServer({ folders: [pushFolder] })
    try {
      loadFaultServerMoveitTestConfig({
        server,
        keys,
        timeoutMs: stallTimeoutMs
      })
      server.setFault(({ operation }) =>
        operation === 'readdir' ? { stall: true } : undefined
      )

      const client = await getSsclClient()

      await expect(client.listPushFolder()).rejects.toMatchObject({
        code: 'SSCL_TIMEOUT',
        message: `SFTP list timed out after ${stallTimeoutMs}ms`
      })
    } finally {
      await server.close()
    }
  })

  it('refuses to build the client in prod when the test route is on', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledKey, true)
    config.set(environmentSetting, 'prod')

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

  it.each(base64Keys)('refuses %s when it is not base64', async (key) => {
    loadMoveitTestConfig()
    config.set(key, 'ssh-ed25519 AAAA host')

    await expect(getSsclClient()).rejects.toThrow(`${key} is not valid base64`)
  })

  it('refuses base64 that has been cut short', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(signingKeySetting, toBase64(keys.ssclSigning.publicKey).slice(1))

    await expect(getSsclClient()).rejects.toThrow(
      `${signingKeySetting} is not valid base64`
    )
  })

  it.each([[signingKeySetting], [encryptionKeySetting]])(
    "refuses %s set to NRF's own key",
    async (key) => {
      loadUsableMoveitTestConfig({ keys })
      config.set(key, toBase64(keys.nrf.publicKey))

      await expect(getSsclClient()).rejects.toThrow(
        "SSCL's PGP public keys must not be NRF's own key"
      )
    }
  )

  it('accepts base64 wrapped over several lines', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(
      signingKeySetting,
      wrapBase64({ base64: toBase64(keys.ssclSigning.publicKey) }).join('\n')
    )

    await expect(getSsclClient()).resolves.toBeDefined()
  })

  it('keeps a build started after a reset when an earlier build fails', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(hostSetting, '')
    const failing = getSsclClient()
    resetSsclClient()
    config.set(hostSetting, 'moveit.example')
    const replacement = getSsclClient()

    await expect(failing).rejects.toThrow(`${hostSetting} is not set`)

    expect(getSsclClient()).toBe(replacement)
    await expect(replacement).resolves.toBeDefined()
  })

  it('tries again after a build that failed, rather than keep the failure', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(hostSetting, '')
    await expect(getSsclClient()).rejects.toThrow(`${hostSetting} is not set`)

    config.set(hostSetting, 'moveit.example')

    await expect(getSsclClient()).resolves.toBeDefined()
  })
})

describe('assertSsclConfig', () => {
  const junk = toBase64('not a key at all')

  it('fails at startup when the test route is on in prod', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledKey, true)
    config.set(environmentSetting, 'prod')

    await expect(assertSsclConfig()).rejects.toThrow(
      'SSCL_SFTP_TEST_ENABLED must not be true in prod'
    )
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
    [hostKeySetting, 'SFTP host key'],
    [privateKeySetting, 'SSH private key'],
    [nrfPrivateKeySetting, pgpPrivateKey],
    [encryptionKeySetting, pgpPublicKey],
    [signingKeySetting, pgpPublicKey]
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

  it('fails at startup when sscl.sftp.privateKey holds a public key', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledKey, true)
    config.set(privateKeySetting, config.get(hostKeySetting))

    await expect(assertSsclConfig()).rejects.toThrow(
      `${privateKeySetting} is not a valid SSH private key`
    )
  })

  it("fails at startup when sscl.pgp.nrfPrivateKey holds NRF's public key, rather than blame the passphrase", async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledKey, true)
    config.set(nrfPrivateKeySetting, toBase64(keys.nrf.publicKey))

    await expect(assertSsclConfig()).rejects.toThrow(
      `${nrfPrivateKeySetting} is not a valid ${pgpPrivateKey}`
    )
  })

  it.each([
    [encryptionKeySetting, 'ssclEncryption'],
    [signingKeySetting, 'ssclSigning']
  ])(
    'fails at startup when %s holds a private key, without quoting it',
    async (key, keyName) => {
      loadUsableMoveitTestConfig({ keys })
      config.set(testEnabledKey, true)
      config.set(key, toBase64(keys[keyName].privateKey))

      const failure = assertSsclConfig()

      await expect(failure).rejects.toThrow(
        `${key} is not a valid ${pgpPublicKey}`
      )
      await expect(failure).rejects.not.toThrow('PRIVATE KEY')
    }
  )

  it('names the first PGP key in config order when more than one cannot be read', async () => {
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledKey, true)
    config.set(encryptionKeySetting, junk)
    config.set(signingKeySetting, junk)

    await expect(assertSsclConfig()).rejects.toThrow(
      `${encryptionKeySetting} is not a valid ${pgpPublicKey}`
    )
  })

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
