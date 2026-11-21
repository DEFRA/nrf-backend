import { randomBytes } from 'node:crypto'
import * as openpgp from 'openpgp'

import { decryptAndVerify, encryptAndSign } from '../common/helpers/sscl/pgp.js'

/**
 * Plays SSCL's side of the file exchange, for tests and the local fake-sscl
 * container. Each rule here is something SSCL or MOVEit has told us, or that
 * we expect of them; add to it as SSCL answers questions.
 */

/** Agreed with SSCL on 18 Nov 2026. */
export const ssclPushFilenamePattern = /^rainv_NRL(INV|CUST)_\d{14}\.dat\.pgp$/

/** Reply faults fake-sscl can be asked to produce. */
export const fakeSsclReplyFaults = {
  unsigned: 'unsigned-reply',
  wrongKey: 'wrong-key-reply',
  oversized: 'oversized-reply',
  /** A good reply under a name with spaces, which NRF refuses to read. */
  oddName: 'odd-name-reply'
}

/**
 * SSCL's private keys and NRF's public key, ASCII-armoured.
 * @typedef {{
 *   encryptionPrivateKey: string,
 *   encryptionPassphrase: string,
 *   signingPrivateKey: string,
 *   signingPassphrase: string,
 *   nrfPublicKey: string
 * }} FakeSsclKeys
 */

/**
 * @typedef {{ filename: string, data: Buffer }} FakeSsclFile
 * @typedef {{ accepted: boolean, problems: string[], contents?: Buffer }} FakeSsclReceipt
 */

/**
 * The problems with a pushed file's name: not the agreed pattern, or the same
 * as a file already received.
 * @param {{ filename: string, archivedNames: Set<string> }} params
 * @returns {string[]}
 */
export function checkPushedFilename({ filename, archivedNames }) {
  const problems = []
  if (!ssclPushFilenamePattern.test(filename)) {
    problems.push(`Name does not match ${ssclPushFilenamePattern}`)
  }
  if (archivedNames.has(filename)) {
    problems.push('A file with this name was already received')
  }
  return problems
}

/**
 * Checks a file NRF pushed as SSCL would: the agreed name, not a duplicate,
 * not empty, encrypted to SSCL and signed by NRF.
 * @param {FakeSsclFile & { keys: FakeSsclKeys, maxFileBytes: number, archivedNames: Set<string> }} params
 * @returns {Promise<FakeSsclReceipt>}
 */
export async function receivePushedFile({
  filename,
  data,
  keys,
  maxFileBytes,
  archivedNames
}) {
  const problems = checkPushedFilename({ filename, archivedNames })
  if (data.length === 0) {
    problems.push('File is empty')
    return { accepted: false, problems }
  }

  let contents
  try {
    contents = await decryptAndVerify({
      data,
      decryptionKey: keys.encryptionPrivateKey,
      passphrase: keys.encryptionPassphrase,
      verificationKey: keys.nrfPublicKey,
      maxDecompressedBytes: maxFileBytes
    })
  } catch (error) {
    problems.push(`Not encrypted to SSCL and signed by NRF: ${error.message}`)
  }
  if (contents?.length === 0) {
    problems.push('Decrypted contents are empty')
  }
  return { accepted: problems.length === 0, problems, contents }
}

/**
 * @param {Date} time
 */
const timestamp = (time) => time.toISOString().replace(/\D/g, '').slice(0, 14)

/**
 * The name of a reply in the pull folder. SSCL's own names are not agreed
 * yet, so NRF must not rely on this pattern.
 * @param {{ about: string, time: Date }} params
 */
export const fakeSsclReplyFilename = ({ about, time }) =>
  `fake_sscl_reply_${about}_${timestamp(time)}.txt.pgp`

const generateStrangerKey = async () => {
  const passphrase = 'throwaway-stranger-passphrase'
  const { privateKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519Legacy',
    userIDs: [{ name: 'Not SSCL', email: 'throwaway@example.com' }],
    passphrase,
    format: 'armored'
  })
  return { privateKey, passphrase }
}

/**
 * @param {{ text: string, nrfPublicKey: string }} params
 */
const encryptUnsigned = async ({ text, nrfPublicKey }) => {
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: Buffer.from(text) }),
    encryptionKeys: await openpgp.readKey({ armoredKey: nrfPublicKey }),
    format: 'binary'
  })
  return Buffer.from(encrypted)
}

/**
 * Builds a file for the pull folder as SSCL would send it: encrypted to NRF
 * and signed by SSCL, unless a fault is asked for.
 * @param {{ about: string, time: Date, keys: FakeSsclKeys, maxFileBytes: number, fault?: string }} params
 * @returns {Promise<FakeSsclFile>}
 */
export async function buildReply({ about, time, keys, maxFileBytes, fault }) {
  const filename =
    fault === fakeSsclReplyFaults.oddName
      ? fakeSsclReplyFilename({ about, time }).replaceAll('_', ' ')
      : fakeSsclReplyFilename({ about, time })
  const text = `Fake SSCL reply about ${about} at ${time.toISOString()}\n`

  if (fault === fakeSsclReplyFaults.oversized) {
    return { filename, data: randomBytes(maxFileBytes + 1) }
  }
  if (fault === fakeSsclReplyFaults.unsigned) {
    return {
      filename,
      data: await encryptUnsigned({ text, nrfPublicKey: keys.nrfPublicKey })
    }
  }
  const signer =
    fault === fakeSsclReplyFaults.wrongKey
      ? await generateStrangerKey()
      : {
          privateKey: keys.signingPrivateKey,
          passphrase: keys.signingPassphrase
        }
  return {
    filename,
    data: await encryptAndSign({
      data: Buffer.from(text),
      encryptionKey: keys.nrfPublicKey,
      signingKey: signer.privateKey,
      passphrase: signer.passphrase
    })
  }
}

/**
 * The fake SSCL's keys for a set of PGP test keys.
 * @param {Awaited<ReturnType<typeof import('./pgp-test-keys.js').generatePgpTestKeys>>} keys
 * @returns {FakeSsclKeys}
 */
export const fakeSsclKeysFor = (keys) => ({
  encryptionPrivateKey: keys.ssclEncryption.privateKey,
  encryptionPassphrase: keys.ssclEncryption.passphrase,
  signingPrivateKey: keys.ssclSigning.privateKey,
  signingPassphrase: keys.ssclSigning.passphrase,
  nrfPublicKey: keys.nrf.publicKey
})
