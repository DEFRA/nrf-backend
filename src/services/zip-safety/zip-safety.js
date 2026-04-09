import yauzl from 'yauzl'

import { config } from '../../config.js'

/**
 * @typedef {{ ok: true } | { ok: false, code: string, message: string }} ValidationResult
 *
 * @typedef {object} Limits
 * @property {number} maxEntries
 * @property {number} maxTotalBytes
 * @property {number} maxEntryBytes
 * @property {number} maxCompressionRatio
 */

/**
 * Validate a zip file buffer against malicious-zip safety limits before
 * extraction. Performs:
 *   - entry count limit
 *   - per-entry uncompressed size limit
 *   - total uncompressed size limit
 *   - compression ratio limit
 *   - nested zip detection
 *   - zip slip detection
 *   - streamed verification of declared sizes (catches doctored central
 *     directories that lie about uncompressedSize)
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, code, message }` on
 * the first failure. Stops at the first problem so a malicious zip cannot
 * burn extra resources.
 *
 * @param {Buffer} buffer
 * @returns {Promise<ValidationResult>}
 */
export function validateZipSafety(buffer) {
  const limits = readLimits()

  return new Promise((resolve) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        resolve(invalidZip('The uploaded file is not a valid zip archive.'))
        return
      }
      walkZip(zipfile, limits, resolve)
    })
  })
}

/** @returns {Limits} */
function readLimits() {
  return {
    maxEntries: config.get('zipSafety.maxEntries'),
    maxTotalBytes: config.get('zipSafety.maxTotalBytes'),
    maxEntryBytes: config.get('zipSafety.maxEntryBytes'),
    maxCompressionRatio: config.get('zipSafety.maxCompressionRatio')
  }
}

/**
 * Walk every entry in the zip, applying header checks and streamed
 * verification. Resolves with the first failure or `{ ok: true }` if every
 * entry passes.
 *
 * @param {import('yauzl').ZipFile} zipfile
 * @param {Limits} limits
 * @param {(result: ValidationResult) => void} resolve
 */
function walkZip(zipfile, limits, resolve) {
  if (zipfile.entryCount > limits.maxEntries) {
    zipfile.close()
    resolve(
      rejection(
        'tooManyFiles',
        `Zip contains too many files (${zipfile.entryCount}). Maximum allowed is ${limits.maxEntries}.`
      )
    )
    return
  }

  const state = { totalUncompressed: 0, settled: false }

  /** @param {ValidationResult} result */
  const settle = (result) => {
    if (state.settled) {
      return
    }
    state.settled = true
    zipfile.close()
    resolve(result)
  }

  zipfile.on('error', (zipErr) => {
    settle(invalidZip(`The uploaded zip is malformed: ${zipErr.message}`))
  })

  zipfile.on('entry', (entry) => {
    handleEntry(zipfile, entry, limits, state, settle)
  })

  zipfile.on('end', () => {
    settle({ ok: true })
  })

  zipfile.readEntry()
}

/**
 * Apply per-entry header checks. If they pass, kick off streamed
 * verification of the entry contents.
 *
 * @param {import('yauzl').ZipFile} zipfile
 * @param {import('yauzl').Entry} entry
 * @param {Limits} limits
 * @param {{ totalUncompressed: number, settled: boolean }} state
 * @param {(result: ValidationResult) => void} settle
 */
function handleEntry(zipfile, entry, limits, state, settle) {
  const name = entry.fileName

  // Directory entries: skip, don't count toward limits.
  if (name.endsWith('/')) {
    zipfile.readEntry()
    return
  }

  const headerFailure = checkEntryHeaders(entry, limits, state)
  if (headerFailure) {
    settle(headerFailure)
    return
  }

  verifyEntryStream(zipfile, entry, limits.maxEntryBytes, settle)
}

/**
 * Run all header-only checks against a single entry. Returns a rejection
 * on the first failing check, or `null` if all checks pass. Side effect:
 * accumulates `state.totalUncompressed`.
 *
 * @param {import('yauzl').Entry} entry
 * @param {Limits} limits
 * @param {{ totalUncompressed: number }} state
 * @returns {ValidationResult | null}
 */
function checkEntryHeaders(entry, limits, state) {
  const name = entry.fileName

  if (name.toLowerCase().endsWith('.zip')) {
    return rejection(
      'nestedZip',
      `Zip contains a nested zip file (${name}). Nested zips are not allowed.`
    )
  }

  if (name.includes('..') || name.startsWith('/')) {
    return rejection(
      'zipSlip',
      `Zip contains an entry with an unsafe path (${name}).`
    )
  }

  if (entry.uncompressedSize > limits.maxEntryBytes) {
    return rejection(
      'entryTooLarge',
      `Zip entry "${name}" is too large when uncompressed (${entry.uncompressedSize} bytes). Maximum per-file size is ${limits.maxEntryBytes} bytes.`
    )
  }

  if (
    entry.compressedSize > 0 &&
    entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio
  ) {
    return rejection(
      'suspiciousCompressionRatio',
      `Zip entry "${name}" appears to be unsafe to extract and has been rejected.`
    )
  }

  state.totalUncompressed += entry.uncompressedSize
  if (state.totalUncompressed > limits.maxTotalBytes) {
    return rejection(
      'totalTooLarge',
      `Zip would expand to more than ${limits.maxTotalBytes} bytes when uncompressed. Maximum allowed total is ${limits.maxTotalBytes} bytes.`
    )
  }

  return null
}

/**
 * Stream the entry contents and abort if the actual byte count exceeds
 * the per-entry cap. Catches doctored central directories that
 * under-report uncompressedSize to bypass the header check.
 *
 * @param {import('yauzl').ZipFile} zipfile
 * @param {import('yauzl').Entry} entry
 * @param {number} perEntryCap
 * @param {(result: ValidationResult) => void} settle
 */
function verifyEntryStream(zipfile, entry, perEntryCap, settle) {
  const name = entry.fileName

  zipfile.openReadStream(entry, (streamErr, readStream) => {
    if (streamErr) {
      settle(
        invalidZip(`Failed to read zip entry "${name}": ${streamErr.message}`)
      )
      return
    }

    const ctx = { actualBytes: 0, aborted: false }

    readStream.on('data', (chunk) => {
      onStreamData(chunk, ctx, name, perEntryCap, readStream, settle)
    })

    readStream.on('end', () => {
      if (!ctx.aborted) {
        zipfile.readEntry()
      }
    })

    readStream.on('error', (rsErr) => {
      if (!ctx.aborted) {
        settle(
          invalidZip(`Failed to read zip entry "${name}": ${rsErr.message}`)
        )
      }
    })
  })
}

/**
 * @param {Buffer} chunk
 * @param {{ actualBytes: number, aborted: boolean }} ctx
 * @param {string} name
 * @param {number} perEntryCap
 * @param {import('node:stream').Readable} readStream
 * @param {(result: ValidationResult) => void} settle
 */
function onStreamData(chunk, ctx, name, perEntryCap, readStream, settle) {
  if (ctx.aborted) {
    return
  }
  ctx.actualBytes += chunk.length
  if (ctx.actualBytes > perEntryCap) {
    ctx.aborted = true
    readStream.destroy()
    settle(
      rejection(
        'entryTooLarge',
        `Zip entry "${name}" appears to be unsafe to extract and has been rejected.`
      )
    )
  }
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {ValidationResult}
 */
function rejection(code, message) {
  return { ok: false, code, message }
}

/**
 * @param {string} message
 * @returns {ValidationResult}
 */
function invalidZip(message) {
  return rejection('invalidZip', message)
}
