import yazl from 'yazl'

import { validateShapefileZipContents } from './shapefile-contents.js'

function buildZip(entries) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    for (const { name, content } of entries) {
      const buf = Buffer.isBuffer(content) ? content : Buffer.from(content)
      zip.addBuffer(buf, name)
    }
    zip.end()
    const chunks = []
    zip.outputStream.on('data', (c) => chunks.push(c))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })
}

describe('validateShapefileZipContents', () => {
  it('accepts a complete shapefile bundle', async () => {
    const zip = await buildZip([
      { name: 'boundary.shp', content: 'shp' },
      { name: 'boundary.shx', content: 'shx' },
      { name: 'boundary.dbf', content: 'dbf' },
      { name: 'boundary.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result).toEqual({ ok: true })
  })

  it('accepts a shapefile bundle inside a subdirectory', async () => {
    const zip = await buildZip([
      { name: 'data/boundary.shp', content: 'shp' },
      { name: 'data/boundary.shx', content: 'shx' },
      { name: 'data/boundary.dbf', content: 'dbf' },
      { name: 'data/boundary.prj', content: 'prj' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result).toEqual({ ok: true })
  })

  it('accepts a single .geojson file', async () => {
    const zip = await buildZip([{ name: 'boundary.geojson', content: '{}' }])
    const result = await validateShapefileZipContents(zip)
    expect(result).toEqual({ ok: true })
  })

  it('accepts a single .kml file', async () => {
    const zip = await buildZip([{ name: 'boundary.kml', content: '<kml/>' }])
    const result = await validateShapefileZipContents(zip)
    expect(result).toEqual({ ok: true })
  })

  it('rejects a zip with no geometry file at all', async () => {
    const zip = await buildZip([
      { name: 'readme.txt', content: 'hi' },
      { name: 'notes.md', content: 'hi' }
    ])
    const result = await validateShapefileZipContents(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('noGeometryFile')
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
    expect(result).toEqual({ ok: true })
  })

  it('rejects a buffer that is not a valid zip', async () => {
    const result = await validateShapefileZipContents(Buffer.from('not a zip'))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('invalidZip')
  })
})
