import { validateShapefileZipContents } from './shapefile-contents.js'
import { buildZip } from '../../test-utils/build-zip.js'

describe('validateShapefileZipContents', () => {
  it('accepts a complete shapefile bundle', async () => {
    const zip = await buildZip([
      { name: 'boundary.shp', content: 'shp' },
      { name: 'boundary.shx', content: 'shx' },
      { name: 'boundary.dbf', content: 'dbf' },
      { name: 'boundary.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result).toEqual({ ok: true, shapefileName: 'boundary.shp' })
  })

  it('accepts a shapefile bundle inside a subdirectory and returns the bare filename', async () => {
    const zip = await buildZip([
      { name: 'data/boundary.shp', content: 'shp' },
      { name: 'data/boundary.shx', content: 'shx' },
      { name: 'data/boundary.dbf', content: 'dbf' },
      { name: 'data/boundary.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result).toEqual({ ok: true, shapefileName: 'boundary.shp' })
  })

  it('rejects a zip containing only a .geojson file', async () => {
    const zip = await buildZip([{ name: 'boundary.geojson', content: '{}' }])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('noShapefile')
  })

  it('rejects a zip containing only a .kml file', async () => {
    const zip = await buildZip([{ name: 'boundary.kml', content: '<kml/>' }])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('noShapefile')
  })

  it('rejects a zip with no shapefile at all', async () => {
    const zip = await buildZip([
      { name: 'readme.txt', content: 'hi' },
      { name: 'notes.md', content: 'hi' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('noShapefile')
  })

  it('rejects a shapefile missing the .prj companion', async () => {
    const zip = await buildZip([
      { name: 'boundary.shp', content: 'shp' },
      { name: 'boundary.shx', content: 'shx' },
      { name: 'boundary.dbf', content: 'dbf' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('missingShapefileComponents')
    expect(result.message).toMatch(/\.prj/)
  })

  it('rejects a shapefile missing the .shx companion', async () => {
    const zip = await buildZip([
      { name: 'boundary.shp', content: 'shp' },
      { name: 'boundary.dbf', content: 'dbf' },
      { name: 'boundary.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('missingShapefileComponents')
    expect(result.message).toMatch(/\.shx/)
  })

  it('rejects a shapefile missing multiple companions and lists them all', async () => {
    const zip = await buildZip([{ name: 'boundary.shp', content: 'shp' }])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('missingShapefileComponents')
    expect(result.message).toMatch(/\.shx/)
    expect(result.message).toMatch(/\.dbf/)
    expect(result.message).toMatch(/\.prj/)
  })

  it('rejects a shapefile whose companion files have a different stem', async () => {
    const zip = await buildZip([
      { name: 'boundary.shp', content: 'shp' },
      { name: 'other.shx', content: 'shx' },
      { name: 'other.dbf', content: 'dbf' },
      { name: 'other.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('missingShapefileComponents')
  })

  it('matches companion files case-insensitively', async () => {
    const zip = await buildZip([
      { name: 'Boundary.SHP', content: 'shp' },
      { name: 'Boundary.SHX', content: 'shx' },
      { name: 'Boundary.DBF', content: 'dbf' },
      { name: 'Boundary.PRJ', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result).toEqual({ ok: true, shapefileName: 'Boundary.SHP' })
  })

  it('picks the lexicographically first .shp when multiple are present', async () => {
    // Added in non-alphabetical order to prove the sort, not the iteration
    // order, is what determines the selection.
    const zip = await buildZip([
      { name: 'zebra.shp', content: 'shp' },
      { name: 'zebra.shx', content: 'shx' },
      { name: 'zebra.dbf', content: 'dbf' },
      { name: 'zebra.prj', content: 'prj' },
      { name: 'alpha.shp', content: 'shp' },
      { name: 'alpha.shx', content: 'shx' },
      { name: 'alpha.dbf', content: 'dbf' },
      { name: 'alpha.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result).toEqual({ ok: true, shapefileName: 'alpha.shp' })
  })

  it('sorts case-insensitively when picking the first .shp', async () => {
    const zip = await buildZip([
      { name: 'Zulu.shp', content: 'shp' },
      { name: 'Zulu.shx', content: 'shx' },
      { name: 'Zulu.dbf', content: 'dbf' },
      { name: 'Zulu.prj', content: 'prj' },
      { name: 'alpha.shp', content: 'shp' },
      { name: 'alpha.shx', content: 'shx' },
      { name: 'alpha.dbf', content: 'dbf' },
      { name: 'alpha.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    // 'alpha' sorts before 'Zulu' with case-insensitive comparison; a naive
    // codepoint sort would put 'Zulu' first (uppercase Z < lowercase a).
    expect(result).toEqual({ ok: true, shapefileName: 'alpha.shp' })
  })

  it('still requires the selected .shp to have all companion files', async () => {
    // alpha.shp is picked first but is missing its .prj; we should not
    // silently fall through to zulu.shp (which has a complete bundle).
    const zip = await buildZip([
      { name: 'alpha.shp', content: 'shp' },
      { name: 'alpha.shx', content: 'shx' },
      { name: 'alpha.dbf', content: 'dbf' },
      { name: 'zulu.shp', content: 'shp' },
      { name: 'zulu.shx', content: 'shx' },
      { name: 'zulu.dbf', content: 'dbf' },
      { name: 'zulu.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('missingShapefileComponents')
    expect(result.message).toMatch(/\.prj/)
  })

  it('rejects a buffer that is not a valid zip', async () => {
    const result = await validateShapefileZipContents(Buffer.from('not a zip'))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('invalidZip')
  })

  it('rejects a .shp entry whose filename contains unsafe characters', async () => {
    // A zip attacker controls both the entry name and the companion names,
    // so as long as the whole bundle shares the same stem it would pass the
    // earlier checks. The safe-filename trust-boundary validation should
    // catch the angle brackets before the name can be stored or rendered.
    const stem = '<script>alert(1)</script>'
    const zip = await buildZip([
      { name: `${stem}.shp`, content: 'shp' },
      { name: `${stem}.shx`, content: 'shx' },
      { name: `${stem}.dbf`, content: 'dbf' },
      { name: `${stem}.prj`, content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('unsafeFilename')
  })
})
