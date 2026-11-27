import { decryptAndVerify, encryptAndSign } from '../common/helpers/sscl/pgp.js'
import { receivePushedFile } from './fake-sscl.js'
import { ssclTestInvoiceFilename } from './fixtures/sscl.js'

/**
 * @typedef {import('./pgp-test-keys.js').PgpTestKeys} PgpTestKeys
 * @typedef {import('./pgp-test-keys.js').PgpTestKeyPair} PgpTestKeyPair
 */

export const fakeSsclTestMaxFileBytes = 1024

/**
 * Encrypted to SSCL and signed by NRF, unless given another recipient or
 * signer.
 * @param {{ text: string, pgp: PgpTestKeys, encryptionKey?: string, signer?: PgpTestKeyPair }} params
 * @returns {Promise<Buffer>}
 */
export const pushedByNrf = ({
  text,
  pgp,
  encryptionKey = pgp.ssclEncryption.publicKey,
  signer = pgp.nrf
}) =>
  encryptAndSign({
    data: Buffer.from(text),
    encryptionKey,
    signingKey: signer.privateKey,
    passphrase: signer.passphrase
  })

/**
 * Encrypted to NRF and signed by SSCL.
 * @param {{ text: string, pgp: PgpTestKeys }} params
 * @returns {Promise<Buffer>}
 */
export const sentBySscl = ({ text, pgp }) =>
  encryptAndSign({
    data: Buffer.from(text),
    encryptionKey: pgp.nrf.publicKey,
    signingKey: pgp.ssclSigning.privateKey,
    passphrase: pgp.ssclSigning.passphrase
  })

/**
 * @param {{
 *   data: Buffer,
 *   keys: import('./fake-sscl.js').FakeSsclKeys,
 *   filename?: string,
 *   maxFileBytes?: number,
 *   archivedNames?: Set<string>
 * }} params
 * @returns {Promise<import('./fake-sscl.js').FakeSsclReceipt>}
 */
export const receiveAsFakeSscl = ({
  data,
  keys,
  filename = ssclTestInvoiceFilename,
  maxFileBytes = fakeSsclTestMaxFileBytes,
  archivedNames = new Set()
}) => receivePushedFile({ filename, data, keys, maxFileBytes, archivedNames })

/**
 * Fails unless the data is encrypted to NRF and signed by SSCL.
 * @param {{ data: Buffer, pgp: PgpTestKeys, maxFileBytes?: number }} params
 * @returns {Promise<Buffer>}
 */
export const readAsNrf = ({
  data,
  pgp,
  maxFileBytes = fakeSsclTestMaxFileBytes
}) =>
  decryptAndVerify({
    data,
    decryptionKey: pgp.nrf.privateKey,
    passphrase: pgp.nrf.passphrase,
    verificationKey: pgp.ssclSigning.publicKey,
    maxDecompressedBytes: maxFileBytes
  })
