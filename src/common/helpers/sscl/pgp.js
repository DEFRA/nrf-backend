import * as openpgp from 'openpgp'

/**
 * @param {{ privateKey: string, passphrase: string }} params
 */
const unlockPrivateKey = async ({ privateKey, passphrase }) => {
  const key = await openpgp.readPrivateKey({ armoredKey: privateKey })
  return key.isDecrypted()
    ? key
    : openpgp.decryptKey({ privateKey: key, passphrase })
}

/**
 * Checks that NRF's private key opens with its passphrase.
 * @param {{ privateKey: string, passphrase: string }} params
 */
export async function assertPgpPrivateKeyUnlocks({ privateKey, passphrase }) {
  await unlockPrivateKey({ privateKey, passphrase })
}

/**
 * The fingerprint of an ASCII-armoured public or private key.
 * @param {string} armoredKey
 */
export async function pgpKeyFingerprint(armoredKey) {
  const key = await openpgp.readKey({ armoredKey })
  return key.getFingerprint()
}

/**
 * Encrypts data to the recipient's public key and signs it with our private
 * key, returning a binary OpenPGP message. Throws if either key cannot be read
 * or the passphrase does not open our private key. Nothing is caught here: the
 * caller decides what a failure means.
 * @param {{ data: Buffer, encryptionKey: string, signingKey: string, passphrase: string }} params
 *   keys are ASCII-armoured
 * @returns {Promise<Buffer>}
 */
export async function encryptAndSign({
  data,
  encryptionKey,
  signingKey,
  passphrase
}) {
  const [encryptionKeys, signingKeys] = await Promise.all([
    openpgp.readKey({ armoredKey: encryptionKey }),
    unlockPrivateKey({ privateKey: signingKey, passphrase })
  ])
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: data }),
    encryptionKeys,
    signingKeys,
    format: 'binary'
  })
  return Buffer.from(encrypted)
}

const armourHeader = '-----BEGIN PGP MESSAGE-----'

/**
 * Reading a message decompresses any compressed data outside the encryption,
 * so it needs the same limit as decrypting.
 * @param {{ data: Buffer, config: { maxDecompressedMessageSize: number } }} params
 */
const readBinaryOrArmoured = ({ data, config }) =>
  data.subarray(0, armourHeader.length).toString('latin1') === armourHeader
    ? openpgp.readMessage({ armoredMessage: data.toString('latin1'), config })
    : openpgp.readMessage({ binaryMessage: data, config })

/**
 * Decrypts an OpenPGP message, binary or ASCII-armoured, with our private key
 * and verifies it was signed by the expected key. Throws if decryption fails,
 * the message has no valid signature from that key, or it decompresses to more
 * than maxDecompressedBytes, whether the compression is inside or outside the
 * encryption (decompression happens before the signature check).
 * @param {{ data: Buffer, decryptionKey: string, passphrase: string, verificationKey: string, maxDecompressedBytes: number }} params
 *   keys are ASCII-armoured
 * @returns {Promise<Buffer>} the decrypted data
 */
export async function decryptAndVerify({
  data,
  decryptionKey,
  passphrase,
  verificationKey,
  maxDecompressedBytes
}) {
  const config = { maxDecompressedMessageSize: maxDecompressedBytes }
  const [message, decryptionKeys, verificationKeys] = await Promise.all([
    readBinaryOrArmoured({ data, config }),
    unlockPrivateKey({ privateKey: decryptionKey, passphrase }),
    openpgp.readKey({ armoredKey: verificationKey })
  ])
  const { data: decrypted } = await openpgp.decrypt({
    message,
    decryptionKeys,
    verificationKeys,
    expectSigned: true,
    format: 'binary',
    config
  })
  return Buffer.from(decrypted)
}
