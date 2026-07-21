import { BOUNDARY_ERRORS } from '@defra/nrf-library'

/**
 * Shared validation for user-supplied filenames that we intend to persist or
 * render. Applied at trust boundaries so the rest of the pipeline (logs, DB,
 * JSON responses, HTML templates, email content, …) cannot be used to smuggle
 * script tags, control characters, path components, or log-forging sequences.
 *
 * The allowed character set is intentionally small — it matches the kind of
 * names real shapefiles and geo-exports actually have (letters, digits,
 * spaces, dots, underscores, hyphens, parentheses). Users with unusual
 * characters in a filename will get a clear rejection message and can rename
 * the file before re-uploading; this is a better outcome than trying to
 * sanitise-and-allow, which hides attacker intent and has a long history of
 * failing open on edge cases.
 */

// Up to 255 chars of printable ASCII drawn from a strict allowlist. No angle
// brackets, no quotes/backticks, no path separators, no percent-encoding, no
// control characters, no whitespace other than a plain space. Leading dots
// (e.g. ".shp") and pure-dot names ("." / "..") are rejected by requiring at
// least one non-dot character.
const SAFE_FILENAME_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9 ._()-]{1,255}$/

/**
 * @typedef {{ ok: true, filename: string }
 *   | { ok: false, code: 'unsafe_filename' }} SafeFilenameResult
 */

/**
 * Normalise and validate a user-supplied filename.
 *
 * Steps:
 *   1. Reject empty / non-string input outright.
 *   2. Strip any directory components (take basename only). This defeats
 *      path-traversal payloads like "../../etc/passwd" and zip entries with
 *      embedded folder paths — the filename we display or store is always
 *      just the leaf.
 *   3. Enforce the character allowlist.
 *
 * @param {unknown} name
 * @returns {SafeFilenameResult}
 */
export function validateSafeFilename(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return unsafeFilename()
  }

  // Handle both forward- and back-slashes — zip tools on Windows routinely
  // emit '\' separators, and we don't want to be fooled into treating
  // "evil\..\..\passwd" as a bare filename.
  const lastForward = name.lastIndexOf('/')
  const lastBackward = name.lastIndexOf('\\')
  const cut = Math.max(lastForward, lastBackward)
  const base = cut === -1 ? name : name.slice(cut + 1)

  if (!SAFE_FILENAME_PATTERN.test(base)) {
    return unsafeFilename()
  }

  return { ok: true, filename: base }
}

/**
 * @returns {SafeFilenameResult}
 */
function unsafeFilename() {
  return { ok: false, code: BOUNDARY_ERRORS.UPLOAD.UNSAFE_FILENAME }
}
