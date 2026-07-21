import { validateSafeFilename } from './safe-filename.js'

describe('validateSafeFilename', () => {
  describe('accepts names that real shapefiles and geo-exports use', () => {
    const cases = [
      'boundary.shp',
      'BnW_small_under_1_hectare.geojson',
      'site-boundary (v2).shp',
      'Site Boundary 2026.kml',
      'A.shp',
      'mixed_Case-123.geojson'
    ]
    it.each(cases)('accepts %s', (name) => {
      const result = validateSafeFilename(name)
      expect(result).toEqual({ ok: true, filename: name })
    })
  })

  describe('rejects obviously hostile content', () => {
    const cases = [
      '<script>alert(1)</script>.shp',
      'boundary"><img src=x onerror=alert(1)>.shp',
      "boundary';DROP TABLE quotes;--.shp",
      'boundary`whoami`.shp'
    ]
    it.each(cases)('rejects %s', (name) => {
      const result = validateSafeFilename(name)
      expect(result.ok).toBe(false)
      expect(result.code).toBe('unsafe_filename')
    })
  })

  describe('rejects control characters and log-forging payloads', () => {
    const cases = [
      'boundary\nINFO fake log line.shp',
      'boundary\r\nError: fake.shp',
      'boundary\t.shp',
      'boundary\u0000.shp',
      'boundary\u001b[31mred.shp'
    ]
    it.each(cases)('rejects filename with control chars: %j', (name) => {
      const result = validateSafeFilename(name)
      expect(result.ok).toBe(false)
      expect(result.code).toBe('unsafe_filename')
    })
  })

  it('strips a forward-slash path and validates the basename', () => {
    const result = validateSafeFilename('../../etc/passwd')
    // basename is "passwd" — allowed characters, but we still want the
    // traversal payload to not round-trip through as-is. Assert the returned
    // filename is the stripped leaf.
    expect(result).toEqual({ ok: true, filename: 'passwd' })
  })

  it('strips a backslash path (Windows-style zip entries)', () => {
    const result = validateSafeFilename('..\\..\\windows\\system32\\cmd.exe')
    expect(result).toEqual({ ok: true, filename: 'cmd.exe' })
  })

  it('rejects a basename that starts with a slash-escaped traversal sequence', () => {
    // Even after basename stripping, the resulting name still needs to pass
    // the allowlist — so an attempt to sneak angle brackets past the path
    // parser by embedding them in the last segment is still rejected.
    const result = validateSafeFilename('data/<script>.shp')
    expect(result.ok).toBe(false)
  })

  it('rejects "." and ".."', () => {
    expect(validateSafeFilename('.').ok).toBe(false)
    expect(validateSafeFilename('..').ok).toBe(false)
  })

  it('rejects an empty string', () => {
    const result = validateSafeFilename('')
    expect(result.ok).toBe(false)
    expect(result.code).toBe('unsafe_filename')
  })

  it('rejects non-string input', () => {
    expect(validateSafeFilename(undefined).ok).toBe(false)
    expect(validateSafeFilename(null).ok).toBe(false)
    expect(validateSafeFilename(42).ok).toBe(false)
    expect(validateSafeFilename({}).ok).toBe(false)
  })

  it('rejects a filename longer than 255 characters', () => {
    const result = validateSafeFilename(`${'a'.repeat(252)}.shp`) // 256 chars
    expect(result.ok).toBe(false)
  })

  it('accepts a filename at exactly 255 characters', () => {
    const result = validateSafeFilename(`${'a'.repeat(251)}.shp`) // 255 chars
    expect(result.ok).toBe(true)
  })

  it('rejects a name containing only dots and spaces', () => {
    expect(validateSafeFilename('...').ok).toBe(false)
    expect(validateSafeFilename('   ').ok).toBe(false)
  })
})
