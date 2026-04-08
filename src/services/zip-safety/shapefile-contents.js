import yauzl from 'yauzl'

const REQUIRED_SHAPEFILE_EXTENSIONS = ['.shp', '.shx', '.dbf', '.prj']

/**
 * Validate that a zip buffer contains a usable boundary geometry.
 *
 * Accepts any of:
 *   - a complete shapefile bundle (.shp + .shx + .dbf + .prj with the same stem)
 *   - a single .geojson file
 *   - a single .kml file
 *
 * Runs *after* validateZipSafety, so the zip is already known to be safe to
 * inspect. Re-walks the central directory rather than re-using the previous
 * pass — keeps the two concerns (safety vs. content correctness) decoupled.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ok: true} | {ok: false, code: string, message: string}>}
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
        if (!/\/$/.test(entry.fileName)) {
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
 * @returns {{ok: true} | {ok: false, code: string, message: string}}
 */
function checkContents(fileNames) {
  const lower = fileNames.map((n) => n.toLowerCase())

  const hasGeojson = lower.some(
    (n) => n.endsWith('.geojson') || n.endsWith('.json')
  )
  const hasKml = lower.some((n) => n.endsWith('.kml'))
  const shpFiles = fileNames.filter((n) => n.toLowerCase().endsWith('.shp'))

  if (shpFiles.length === 0 && !hasGeojson && !hasKml) {
    return {
      ok: false,
      code: 'noGeometryFile',
      message:
        'Zip must contain a shapefile (.shp with .shx, .dbf and .prj companions), a .geojson file, or a .kml file.'
    }
  }

  // GeoJSON / KML alone is fine — no companion files needed.
  if (shpFiles.length === 0) {
    return { ok: true }
  }

  // A shapefile is present: enforce the full companion bundle for the same
  // stem. We pick the first .shp and check that all four extensions exist
  // alongside it (case-insensitive, same stem, same directory).
  const shpPath = shpFiles[0]
  const lastSlash = shpPath.lastIndexOf('/')
  const dir = lastSlash === -1 ? '' : shpPath.slice(0, lastSlash + 1)
  const stem = shpPath.slice(lastSlash + 1, -4) // strip ".shp"

  const haveByExt = new Set(
    lower
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

  return { ok: true }
}
