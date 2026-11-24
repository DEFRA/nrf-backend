import * as openpgp from 'openpgp'

import {
  assertPgpPrivateKeyUnlocks,
  decryptAndVerify,
  encryptAndSign,
  pgpKeyFingerprint
} from './pgp.js'
import { generatePgpTestKeys } from '../../../test-utils/pgp-test-keys.js'

const plaintextContent = 'NRF test file\n'
const plaintext = Buffer.from(plaintextContent)
const maxDecompressedBytes = 1024 * 1024

describe('pgp', () => {
  let keys

  beforeAll(async () => {
    keys = await generatePgpTestKeys()
  })

  const unlockedNrfKey = async () =>
    openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({
        armoredKey: keys.nrf.privateKey
      }),
      passphrase: keys.nrf.passphrase
    })

  const pushAsNrf = (data = plaintext) =>
    encryptAndSign({
      data,
      encryptionKey: keys.ssclEncryption.publicKey,
      signingKey: keys.nrf.privateKey,
      passphrase: keys.nrf.passphrase
    })

  const readAsSscl = (data) =>
    decryptAndVerify({
      data,
      decryptionKey: keys.ssclEncryption.privateKey,
      passphrase: keys.ssclEncryption.passphrase,
      verificationKey: keys.nrf.publicKey,
      maxDecompressedBytes
    })

  it('encrypts to the recipient key and signs with ours so the recipient can read and verify it', async () => {
    const encrypted = await pushAsNrf()

    const data = await readAsSscl(encrypted)

    expect(encrypted.includes(plaintext)).toBe(false)
    expect(data.toString()).toBe(plaintextContent)
  })

  it('reads an ASCII-armoured message as well as a binary one', async () => {
    const armoured = await openpgp.encrypt({
      message: await openpgp.createMessage({ binary: plaintext }),
      encryptionKeys: await openpgp.readKey({
        armoredKey: keys.ssclEncryption.publicKey
      }),
      signingKeys: await unlockedNrfKey()
    })

    const data = await readAsSscl(Buffer.from(armoured))

    expect(armoured.startsWith('-----BEGIN PGP MESSAGE-----')).toBe(true)
    expect(data.toString()).toBe(plaintextContent)
  })

  it('rejects a signed file that decompresses to more than the limit', async () => {
    const bomb = await openpgp.encrypt({
      message: await openpgp.createMessage({
        binary: Buffer.alloc(maxDecompressedBytes * 2)
      }),
      encryptionKeys: await openpgp.readKey({
        armoredKey: keys.ssclEncryption.publicKey
      }),
      signingKeys: await unlockedNrfKey(),
      format: 'binary',
      config: {
        preferredCompressionAlgorithm: openpgp.enums.compression.zlib
      }
    })

    expect(bomb.length).toBeLessThan(maxDecompressedBytes)
    await expect(readAsSscl(Buffer.from(bomb))).rejects.toThrow(
      /Maximum decompressed message size exceeded/
    )
  })

  it('rejects a file signed by someone other than the expected signer', async () => {
    const encrypted = await encryptAndSign({
      data: plaintext,
      encryptionKey: keys.ssclEncryption.publicKey,
      signingKey: keys.stranger.privateKey,
      passphrase: keys.stranger.passphrase
    })

    await expect(readAsSscl(encrypted)).rejects.toThrow(
      /Could not find signing key/
    )
  })

  it('rejects an unsigned file', async () => {
    const unsigned = await openpgp.encrypt({
      message: await openpgp.createMessage({ binary: plaintext }),
      encryptionKeys: await openpgp.readKey({
        armoredKey: keys.ssclEncryption.publicKey
      }),
      format: 'binary'
    })

    await expect(readAsSscl(Buffer.from(unsigned))).rejects.toThrow(
      'Message is not signed'
    )
  })

  it('rejects a file that was not encrypted to our key', async () => {
    const encrypted = await pushAsNrf()

    await expect(
      decryptAndVerify({
        data: encrypted,
        decryptionKey: keys.stranger.privateKey,
        passphrase: keys.stranger.passphrase,
        verificationKey: keys.nrf.publicKey,
        maxDecompressedBytes
      })
    ).rejects.toThrow(/No decryption key packets found/)
  })

  it('rejects a private key with the wrong passphrase', async () => {
    await expect(
      encryptAndSign({
        data: plaintext,
        encryptionKey: keys.ssclEncryption.publicKey,
        signingKey: keys.nrf.privateKey,
        passphrase: 'wrong'
      })
    ).rejects.toThrow(/Incorrect key passphrase/)
  })

  it('accepts the passphrase that opens the private key', async () => {
    await expect(
      assertPgpPrivateKeyUnlocks({
        privateKey: keys.nrf.privateKey,
        passphrase: keys.nrf.passphrase
      })
    ).resolves.toBeUndefined()
  })

  it('rejects a passphrase that does not open the private key', async () => {
    await expect(
      assertPgpPrivateKeyUnlocks({
        privateKey: keys.nrf.privateKey,
        passphrase: 'wrong'
      })
    ).rejects.toThrow(/Incorrect key passphrase/)
  })

  it('uses a private key that has no passphrase as it is', async () => {
    const { privateKey } = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519Legacy',
      userIDs: [{ name: 'No passphrase' }],
      format: 'armored'
    })

    await expect(
      assertPgpPrivateKeyUnlocks({ privateKey, passphrase: '' })
    ).resolves.toBeUndefined()
  })

  it('gives a private key and its public key the same fingerprint', async () => {
    const fromPrivate = await pgpKeyFingerprint(keys.nrf.privateKey)
    const fromPublic = await pgpKeyFingerprint(keys.nrf.publicKey)
    const other = await pgpKeyFingerprint(keys.stranger.publicKey)

    expect(fromPrivate).toBe(fromPublic)
    expect(fromPrivate).not.toBe(other)
  })
})
