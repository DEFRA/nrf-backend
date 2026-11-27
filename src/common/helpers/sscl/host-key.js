import { createHash } from 'node:crypto'

const fingerprintPrefix = 'SHA256:'
// A SHA-256 digest is 43 base64 characters once the padding is dropped
const fingerprintPattern = /^SHA256:[A-Za-z0-9+/]{43}$/
const lengthPrefixBytes = 4
const formatError =
  'SFTP host key must be an OpenSSH public key line, an RFC 4716 block or a SHA256 fingerprint'

// OpenSSH writes the fingerprint without base64 padding, and '=' appears in
// base64 only as padding.
const fingerprintOf = (keyBlob) =>
  fingerprintPrefix +
  createHash('sha256').update(keyBlob).digest('base64').replaceAll('=', '')

/**
 * The base64 key lines of an RFC 4716 block, skipping the BEGIN/END markers
 * and headers, including headers continued onto the next line with `\`.
 * @param {string} text
 */
const keyBlobFromRfc4716 = (text) => {
  const keyLines = []
  let inHeader = false
  for (const line of text.split(/\r?\n/).map((raw) => raw.trim())) {
    const isHeader = inHeader || line.includes(':')
    inHeader = isHeader && line.endsWith('\\')
    if (line && !line.startsWith('----') && !isHeader) {
      keyLines.push(line)
    }
  }
  return keyLines.join('')
}

/**
 * The key type a public key blob starts with, such as ssh-ed25519, or
 * undefined when the bytes are not a key blob.
 * @param {Buffer} keyBlob
 */
const keyTypeOf = (keyBlob) => {
  if (keyBlob.length <= lengthPrefixBytes) {
    return undefined
  }
  const typeEnd = lengthPrefixBytes + keyBlob.readUInt32BE(0)
  const type = keyBlob.subarray(lengthPrefixBytes, typeEnd).toString('latin1')
  return typeEnd < keyBlob.length && /^(ssh|ecdsa|sk)-[\w.@-]+$/.test(type)
    ? type
    : undefined
}

/**
 * The fingerprint of the pinned host key. Throws when the text is none of the
 * accepted formats, so a mistyped key fails when the verifier is built rather
 * than at the first connection.
 * @param {string} hostKey
 */
const pinnedFingerprint = (hostKey) => {
  const text = hostKey.trim()
  if (text.startsWith(fingerprintPrefix)) {
    if (!fingerprintPattern.test(text)) {
      throw new Error(formatError)
    }
    return text
  }
  const isRfc4716 = text.startsWith('----')
  const [lineType, lineBase64] = text.split(/\s+/)
  const keyBlob = Buffer.from(
    (isRfc4716 ? keyBlobFromRfc4716(text) : lineBase64) ?? '',
    'base64'
  )
  const type = keyTypeOf(keyBlob)
  if (!type || (!isRfc4716 && type !== lineType)) {
    throw new Error(formatError)
  }
  return fingerprintOf(keyBlob)
}

/**
 * Builds an ssh2 `hostVerifier` that only accepts the pinned server host key.
 * The pinned key may be an OpenSSH public key line, an RFC 4716 public key
 * block or a `SHA256:` fingerprint.
 * @param {string} hostKey
 * @returns {(keyBlob: Buffer) => boolean}
 */
export function createHostVerifier(hostKey) {
  if (!hostKey?.trim()) {
    throw new Error('SFTP host key is not configured')
  }
  const expected = pinnedFingerprint(hostKey)
  return function verifyHostKey(keyBlob) {
    return fingerprintOf(keyBlob) === expected
  }
}
