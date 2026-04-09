import yauzl from 'yauzl'

// A legal shapefile bundle is a set of sibling files sharing the same stem.
// We require all four because:
//   .shp — the geometry itself (points / lines / polygons)
//   .shx — positional index into .shp; mandatory per the ESRI spec, and
//          GDAL/Fiona/GeoPandas refuse to open a shapefile without it
//   .dbf — dBASE attribute table; also mandatory per the spec, even when
//          there are no meaningful attributes (a dummy FID column is fine)
//   .prj — well-known-text CRS definition; technically optional in the
//          spec, but without it we cannot reliably reproject the geometry,
//          so we require it up-front rather than failing later with a
//          confusing "unsupported CRS" error.
const SHP_EXT = '.shp'
const SHX_EXT = '.shx'
const DBF_EXT = '.dbf'
const PRJ_EXT = '.prj'
const REQUIRED_SHAPEFILE_EXTENSIONS = [SHP_EXT, SHX_EXT, DBF_EXT, PRJ_EXT]

/**
 * @typedef {{ ok: true, shapefileName: string }
 *   | { ok: false, code: string, message: string }} ShapefileContentsResult
 */

/**
 * Validate that a zip buffer contains a complete shapefile bundle
 * (.shp + .shx + .dbf + .prj with the same stem) and return the name of the
 * selected .shp file on success.
 *
 * Zip uploads are *only* used to bundle shapefile components together.
 * .geojson and .kml uploads come through as standalone files, not zipped,
 * so we deliberately reject them when found inside a zip.
 *
 * When a zip contains more than one .shp, we pick the one whose in-zip path
 * sorts first case-insensitively (`localeCompare` with `sensitivity: 'base'`).
 * This gives a deterministic, cross-platform rule we can tell users about —
 * we sort the same way regardless of central-directory order, filesystem
 * iteration order, or extraction tool.
 *
 * Runs *after* validateZipSafety, so the zip is already known to be safe to
 * inspect. Re-walks the central directory rather than re-using the previous
 * pass — keeps the two concerns (safety vs. content correctness) decoupled.
 *
 * @param {Buffer} buffer
 * @returns {Promise<ShapefileContentsResult>}
 */
export function validateShapefileZipContents(buffer) {
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

      /** @type {string[]} */
      const fileNames = []

      zipfile.on('entry', (entry) => {
        if (!entry.fileName.endsWith('/')) {
          fileNames.push(entry.fileName)
        }
        zipfile.readEntry()
      })

      zipfile.on('end', () => {
        resolve(checkContents(fileNames))
      })

      zipfile.on('error', () => {
        resolve({
          ok: false,
          code: 'invalidZip',
          message: 'The uploaded zip is malformed.'
        })
      })

      zipfile.readEntry()
    })
  })
}

/**
 * @param {string[]} fileNames
 * @returns {ShapefileContentsResult}
 */
function checkContents(fileNames) {
  const shpFiles = fileNames.filter((n) => n.toLowerCase().endsWith(SHP_EXT))

  if (shpFiles.length === 0) {
    return {
      ok: false,
      code: 'noShapefile',
      message:
        'Zip must contain a shapefile (.shp with .shx, .dbf and .prj companions).'
    }
  }

  // Deterministic tiebreaker when a zip contains multiple .shp entries: pick
  // the one whose in-zip path sorts first case-insensitively. This does not
  // depend on zip central-directory order, extraction order, or any OS/FS
  // specific iteration, so the selection is reproducible everywhere.
  const shpPath = [...shpFiles].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )[0]
  const lastSlash = shpPath.lastIndexOf('/')
  const dir = lastSlash === -1 ? '' : shpPath.slice(0, lastSlash + 1)
  const stem = shpPath.slice(lastSlash + 1, -SHP_EXT.length) // strip ".shp"

  const haveByExt = new Set(
    fileNames
      .map((n) => n.toLowerCase())
      .filter((n) => {
        const nLastSlash = n.lastIndexOf('/')
        const nDir = nLastSlash === -1 ? '' : n.slice(0, nLastSlash + 1)
        const nStem = n.slice(nLastSlash + 1, n.lastIndexOf('.'))
        return nDir === dir.toLowerCase() && nStem === stem.toLowerCase()
      })
      .map((n) => n.slice(n.lastIndexOf('.')))
  )

  const missing = REQUIRED_SHAPEFILE_EXTENSIONS.filter(
    (ext) => !haveByExt.has(ext)
  )

  if (missing.length > 0) {
    return {
      ok: false,
      code: 'missingShapefileComponents',
      message: `Shapefile is missing required companion files: ${missing.join(', ')}. A shapefile zip must contain ${REQUIRED_SHAPEFILE_EXTENSIONS.join(', ')} files with the same name.`
    }
  }

  // Return just the filename (not the in-zip path) — this is what we show to
  // the user and persist with the quote.
  const shapefileName = shpPath.slice(lastSlash + 1)
  return { ok: true, shapefileName }
}
