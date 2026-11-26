import ssh2 from 'ssh2'

import { config } from '../config.js'
import {
  fakeSsclStartupReplyFilename,
  ssclTestFaultServerStub
} from './fixtures/sscl.js'
import { createInMemorySsclClient } from './in-memory-sscl.js'
import { sftpTestFolders } from './sftp-test-transport.js'
import {
  collectPulledFiles,
  fromBase64,
  loadFaultServerMoveitTestConfig,
  loadMoveitTestConfig,
  loadUsableMoveitTestConfig,
  moveitTestFolders,
  moveitTestUsers,
  nrfPgpKeysFor,
  overridePullSession,
  pgpConfigFor,
  pulledStatuses,
  pullFolderNames,
  refuseOn,
  runBeforeEachDownload,
  ssclTestLimits,
  toBase64,
  uniqueTestFilename,
  withCode,
  wrapBase64
} from './sscl-test-helpers.js'
import { generatePgpTestKeys } from './pgp-test-keys.js'

const nrfPrivateText = 'nrf private'

describe('wrapBase64', () => {
  it('splits base64 into lines of 64 characters', () => {
    expect(wrapBase64({ base64: 'a'.repeat(70) })).toEqual([
      'a'.repeat(64),
      'a'.repeat(6)
    ])
  })

  it('splits at another width when given one', () => {
    expect(wrapBase64({ base64: 'abcde', width: 2 })).toEqual(['ab', 'cd', 'e'])
  })
})

describe('toBase64', () => {
  it('encodes text as base64', () => {
    expect(toBase64('hello')).toBe('aGVsbG8=')
  })
})

describe('fromBase64', () => {
  it('decodes base64 to text', () => {
    expect(fromBase64('aGVsbG8=')).toBe('hello')
  })
})

describe('MOVEit test config', () => {
  const originalSscl = config.get('sscl')
  let keys

  beforeAll(async () => {
    keys = await generatePgpTestKeys()
  })

  afterEach(() => {
    config.load({ sscl: originalSscl })
  })

  describe('loadMoveitTestConfig', () => {
    it('sets every MOVEit setting, with SSH keys that can be read', () => {
      loadMoveitTestConfig()
      const { sftp, pgp } = config.get('sscl')

      expect(sftp).toMatchObject({
        host: expect.any(String),
        pushUser: moveitTestUsers.push,
        pushFolder: moveitTestFolders.push,
        pullUser: moveitTestUsers.pull,
        pullFolder: moveitTestFolders.pull
      })
      expect(ssh2.utils.parseKey(fromBase64(sftp.hostKey))).not.toBeInstanceOf(
        Error
      )
      expect(
        ssh2.utils.parseKey(fromBase64(sftp.privateKey))
      ).not.toBeInstanceOf(Error)
      const someBase64 = expect.stringMatching(/^[A-Za-z0-9+/]+={0,2}$/)
      expect(pgp).toMatchObject({
        nrfPrivateKey: someBase64,
        ssclEncryptionPublicKey: someBase64,
        ssclSigningPublicKey: someBase64
      })
    })

    it('uses the PGP keys it is given', () => {
      loadMoveitTestConfig({ pgp: { nrfPrivateKey: toBase64(nrfPrivateText) } })

      expect(config.get('sscl.pgp.nrfPrivateKey')).toBe(
        toBase64(nrfPrivateText)
      )
    })
  })

  describe('pgpConfigFor', () => {
    it('gives the PGP test keys in base64, with the passphrase as it is', () => {
      expect(pgpConfigFor(keys)).toEqual({
        nrfPrivateKey: toBase64(keys.nrf.privateKey),
        nrfPassphrase: keys.nrf.passphrase,
        ssclEncryptionPublicKey: toBase64(keys.ssclEncryption.publicKey),
        ssclSigningPublicKey: toBase64(keys.ssclSigning.publicKey)
      })
    })
  })

  describe('loadUsableMoveitTestConfig', () => {
    it('loads the PGP test keys as config holds them', () => {
      loadUsableMoveitTestConfig({ keys })

      expect(config.get('sscl.pgp')).toMatchObject(pgpConfigFor(keys))
    })
  })

  describe('loadFaultServerMoveitTestConfig', () => {
    const server = ssclTestFaultServerStub

    it('points the MOVEit settings at the server, with its keys in base64, and says where it listens', () => {
      const listening = loadFaultServerMoveitTestConfig({ server, keys })

      const { host, port, hostKey, privateKey } = server.settings()

      expect(listening).toEqual({ host, port })
      expect(config.get('sscl.sftp')).toMatchObject({
        host,
        port,
        hostKey: toBase64(hostKey),
        privateKey: toBase64(privateKey)
      })
      expect(config.get('sscl.pgp')).toMatchObject(pgpConfigFor(keys))
    })

    it('sets the SFTP time limit when given one', () => {
      loadFaultServerMoveitTestConfig({ server, keys, timeoutMs: 1234 })

      expect(config.get('sscl.sftp.timeoutMs')).toBe(1234)
    })
  })
})

describe('nrfPgpKeysFor', () => {
  it("gives the SSCL client NRF's private key and SSCL's public keys", () => {
    const pgp = {
      nrf: {
        privateKey: nrfPrivateText,
        publicKey: 'nrf public',
        passphrase: 'nrf passphrase'
      },
      ssclEncryption: {
        privateKey: 'encryption private',
        publicKey: 'encryption public',
        passphrase: 'encryption passphrase'
      },
      ssclSigning: {
        privateKey: 'signing private',
        publicKey: 'signing public',
        passphrase: 'signing passphrase'
      },
      stranger: {
        privateKey: 'stranger private',
        publicKey: 'stranger public',
        passphrase: 'stranger passphrase'
      }
    }

    expect(nrfPgpKeysFor(pgp)).toEqual({
      nrfPrivateKey: nrfPrivateText,
      nrfPassphrase: 'nrf passphrase',
      ssclEncryptionPublicKey: 'encryption public',
      ssclSigningPublicKey: 'signing public'
    })
  })
})

describe('withCode', () => {
  it('gives an error carrying the code', () => {
    const error = withCode(4)

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(4)
  })
})

describe('pulledStatuses', () => {
  it("gives each file's name and status, in the order pulled", () => {
    const pulled = {
      files: [
        { filename: 'b.txt.pgp', status: 'received', size: 3 },
        { filename: 'a.txt.pgp', status: 'gone', size: 5 }
      ]
    }

    expect(pulledStatuses(pulled)).toEqual([
      ['b.txt.pgp', 'received'],
      ['a.txt.pgp', 'gone']
    ])
  })
})

describe('refuseOn', () => {
  it('refuses only the given operation on the given file', () => {
    const server = { setFault: vi.fn() }
    const { pull } = sftpTestFolders

    refuseOn({ server, operation: 'remove', filename: 'a.pgp', status: 4 })
    const [[fault]] = server.setFault.mock.calls

    expect([
      fault({ operation: 'remove', path: `${pull}/a.pgp` }),
      fault({ operation: 'open', path: `${pull}/a.pgp` }),
      fault({ operation: 'remove', path: `${pull}/b.pgp` }),
      fault({ operation: 'remove', path: `${pull}/ba.pgp` })
    ]).toEqual([{ status: 4 }, undefined, undefined, undefined])
  })
})

describe('collectPulledFiles', () => {
  it('keeps each file its handler is given, in order', async () => {
    const { stored, onFile } = collectPulledFiles()

    await onFile({ filename: 'b.txt.pgp' })
    await onFile({ filename: 'a.txt.pgp' })

    expect(stored).toEqual([
      { filename: 'b.txt.pgp' },
      { filename: 'a.txt.pgp' }
    ])
  })
})

describe('uniqueTestFilename', () => {
  it('gives a new name with the prefix each time', () => {
    const names = [
      uniqueTestFilename('SSCL_TEST'),
      uniqueTestFilename('SSCL_TEST')
    ]

    expect(names[0]).not.toBe(names[1])
    expect(names).toEqual([
      expect.stringMatching(/^SSCL_TEST_[0-9a-f-]{36}\.pgp$/),
      expect.stringMatching(/^SSCL_TEST_[0-9a-f-]{36}\.pgp$/)
    ])
  })
})

describe('pull folder helpers', () => {
  let transport

  beforeEach(async () => {
    ;({
      sscl: { transport }
    } = await createInMemorySsclClient())
  })

  it('pullFolderNames gives the names of the files in the pull folder', async () => {
    expect(await pullFolderNames(transport)).toEqual([
      fakeSsclStartupReplyFilename
    ])
  })

  it('overridePullSession replaces the given operation and leaves the rest', async () => {
    overridePullSession({
      transport,
      overrides: {
        download: async () => {
          throw withCode(4)
        }
      }
    })

    await expect(
      transport.withPullSession((session) =>
        session.download({
          filename: fakeSsclStartupReplyFilename,
          maxBytes: 100
        })
      )
    ).rejects.toMatchObject({ code: 4 })
    expect(await pullFolderNames(transport)).toEqual([
      fakeSsclStartupReplyFilename
    ])
  })

  it('overridePullSession gives back a way to undo the override', async () => {
    const restorePullSession = overridePullSession({
      transport,
      overrides: { list: async () => [] }
    })
    const overridden = await pullFolderNames(transport)

    restorePullSession()

    expect(overridden).toEqual([])
    expect(await pullFolderNames(transport)).toEqual([
      fakeSsclStartupReplyFilename
    ])
  })

  it('runBeforeEachDownload does the given work on each file before it is downloaded', async () => {
    runBeforeEachDownload({
      transport,
      beforeDownload: ({ session, filename }) => session.remove(filename)
    })

    await expect(
      transport.withPullSession((session) =>
        session.download({
          filename: fakeSsclStartupReplyFilename,
          maxBytes: 100
        })
      )
    ).rejects.toThrow(`No such file: ${fakeSsclStartupReplyFilename}`)
  })

  it('runBeforeEachDownload gives back a way to undo it', async () => {
    const beforeDownload = vi.fn()
    const restorePullSession = runBeforeEachDownload({
      transport,
      beforeDownload
    })

    restorePullSession()
    await transport.withPullSession((session) =>
      session.download({
        filename: fakeSsclStartupReplyFilename,
        maxBytes: ssclTestLimits.maxFileBytes
      })
    )

    expect(beforeDownload).not.toHaveBeenCalled()
  })
})
