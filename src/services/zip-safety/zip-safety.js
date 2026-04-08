import yauzl from 'yauzl'

import { config } from '../../config.js'

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
 * @returns {Promise<{ok: true} | {ok: false, code: string, message: string}>}
 */
export function validateZipSafety(buffer) {
  const limits = {
    maxEntries: config.get('zipSafety.maxEntries'),
    maxTotalBytes: config.get('zipSafety.maxTotalBytes'),
    maxEntryBytes: config.get('zipSafety.maxEntryBytes'),
    maxCompressionRatio: config.get('zipSafety.maxCompressionRatio')
  }

  return new Promise((resolve) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        resolve({
          ok: false,
          code: 'invalidZip',
          message: 'The uploaded file is not a valid zip archive.'
        })
        return
      }

      if (zipfile.entryCount > limits.maxEntries) {
        zipfile.close()
        resolve({
          ok: false,
          code: 'tooManyFiles',
          message: `Zip contains too many files (${zipfile.entryCount}). Maximum allowed is ${limits.maxEntries}.`
        })
        return
      }

      let totalUncompressed = 0
      let settled = false

      /**
       * @param {string} code
       * @param {string} message
       */
      const fail = (code, message) => {
        if (settled) return
        settled = true
        zipfile.close()
        resolve({ ok: false, code, message })
      }

      const succeed = () => {
        if (settled) return
        settled = true
        resolve({ ok: true })
      }

      zipfile.on('error', (zipErr) => {
        fail('invalidZip', `The uploaded zip is malformed: ${zipErr.message}`)
      })

      zipfile.on('entry', (entry) => {
        const name = entry.fileName

        // Directory entries: skip, don't count toward limits.
        if (/\/$/.test(name)) {
          zipfile.readEntry()
          return
        }

        if (/\.zip$/i.test(name)) {
          fail(
            'nestedZip',
            `Zip contains a nested zip file (${name}). Nested zips are not allowed.`
          )
          return
        }

        if (name.includes('..') || name.startsWith('/')) {
          fail(
            'zipSlip',
            `Zip contains an entry with an unsafe path (${name}).`
          )
          return
        }

        if (entry.uncompressedSize > limits.maxEntryBytes) {
          fail(
            'entryTooLarge',
            `Zip entry "${name}" is too large when uncompressed (${entry.uncompressedSize} bytes). Maximum per-file size is ${limits.maxEntryBytes} bytes.`
          )
          return
        }

        if (
          entry.compressedSize > 0 &&
          entry.uncompressedSize / entry.compressedSize >
            limits.maxCompressionRatio
        ) {
          fail(
            'suspiciousCompressionRatio',
            `Zip entry "${name}" has a suspicious compression ratio. This may indicate a zip bomb.`
          )
          return
        }

        totalUncompressed += entry.uncompressedSize
        if (totalUncompressed > limits.maxTotalBytes) {
          fail(
            'totalTooLarge',
            `Zip would expand to more than ${limits.maxTotalBytes} bytes when uncompressed. Maximum allowed total is ${limits.maxTotalBytes} bytes.`
          )
          return
        }

        // Streamed verification: actually read the entry to confirm the
        // declared uncompressed size is honest. Catches doctored central
        // directories that under-report sizes to bypass the header checks.
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            fail(
              'invalidZip',
              `Failed to read zip entry "${name}": ${streamErr.message}`
            )
            return
          }

          let entryActualBytes = 0
          const perEntryCap = limits.maxEntryBytes
          let aborted = false

          readStream.on('data', (chunk) => {
            if (aborted) return
            entryActualBytes += chunk.length
            if (entryActualBytes > perEntryCap) {
              aborted = true
              readStream.destroy()
              fail(
                'entryTooLarge',
                `Zip entry "${name}" exceeds the per-file size limit of ${perEntryCap} bytes during extraction. This may indicate a zip bomb.`
              )
            }
          })

          readStream.on('end', () => {
            if (aborted) return
            zipfile.readEntry()
          })

          readStream.on('error', (rsErr) => {
            if (aborted) return
            fail(
              'invalidZip',
              `Failed to read zip entry "${name}": ${rsErr.message}`
            )
          })
        })
      })

      zipfile.on('end', () => {
        succeed()
      })

      zipfile.readEntry()
    })
  })
}
