import { createHash } from 'node:crypto'

const fingerprintPrefix = 'SHA256:'

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

const pinnedFingerprint = (hostKey) => {
  const text = hostKey.trim()
  if (text.startsWith(fingerprintPrefix)) {
    return text
  }
  const keyBase64 = text.startsWith('----')
    ? keyBlobFromRfc4716(text)
    : text.split(/\s+/)[1]
  const keyBlob = Buffer.from(keyBase64 ?? '', 'base64')
  if (keyBlob.length === 0) {
    throw new Error(
      'SFTP host key must be an OpenSSH public key line, an RFC 4716 block or a SHA256 fingerprint'
    )
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
