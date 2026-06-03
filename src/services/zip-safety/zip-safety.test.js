import { Readable } from 'node:stream'

import { validateZipSafety } from './zip-safety.js'
import { buildZip } from '../../test-utils/build-zip.js'

/**
 * Build a stub yauzl ZipFile for tests that need to simulate a malicious or
 * malformed central directory that the real yazl writer would refuse to
 * produce.
 */
function makeFakeZipfile(entries) {
  let index = 0
  const handlers = {}
  return {
    entryCount: entries.length,
    on(event, handler) {
      handlers[event] = handler
    },
    readEntry() {
      if (index < entries.length) {
        const entry = entries[index++]
        handlers.entry?.(entry)
      } else {
        handlers.end?.()
      }
    },
    openReadStream(entry, cb) {
      cb(null, Readable.from(Buffer.alloc(entry.uncompressedSize ?? 0)))
    },
    close() {}
  }
}

describe('validateZipSafety', () => {
  it('accepts a normal shapefile-style zip', async () => {
    const zip = await buildZip([
      { name: 'boundary.shp', content: 'fake shp content' },
      { name: 'boundary.shx', content: 'fake shx content' },
      { name: 'boundary.dbf', content: 'fake dbf content' },
      { name: 'boundary.prj', content: 'GEOGCS["WGS 84"]' }
    ])

    const result = await validateZipSafety(zip)
    expect(result).toEqual({ ok: true })
  })

  it('accepts an empty zip', async () => {
    const zip = await buildZip([])
    const result = await validateZipSafety(zip)
    expect(result).toEqual({ ok: true })
  })

  it('rejects a zip with too many entries', async () => {
    const entries = []
    for (let i = 0; i < 15; i++) {
      entries.push({ name: `file${i}.txt`, content: 'x' })
    }
    const zip = await buildZip(entries)

    const result = await validateZipSafety(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('tooManyFiles')
    expect(result.message).toMatch(/too many files/i)
  })

  it('rejects a zip whose total uncompressed size exceeds the limit', async () => {
    // Use random bytes to avoid hitting the compression-ratio check first.
    // Per-entry stays under 20 MB but total exceeds 20 MB.
    const big = Buffer.alloc(5 * 1024 * 1024)
    for (let i = 0; i < big.length; i++) {
      big[i] = Math.floor(Math.random() * 256)
    }
    const zip = await buildZip([
      { name: 'a.bin', content: big },
      { name: 'b.bin', content: big },
      { name: 'c.bin', content: big },
      { name: 'd.bin', content: big },
      { name: 'e.bin', content: big }
    ])

    const result = await validateZipSafety(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('totalTooLarge')
  }, 30000)

  it('rejects a zip with a single entry larger than the per-entry limit', async () => {
    const huge = Buffer.alloc(21 * 1024 * 1024)
    for (let i = 0; i < huge.length; i++) {
      huge[i] = Math.floor(Math.random() * 256)
    }
    const zip = await buildZip([{ name: 'huge.bin', content: huge }])

    const result = await validateZipSafety(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('entryTooLarge')
  }, 30000)

  it('rejects a zip with a suspicious compression ratio (zip bomb)', async () => {
    // 2 MB of zeros compresses to a few KB → ratio well above 100.
    const zeros = Buffer.alloc(2 * 1024 * 1024, 0)
    const zip = await buildZip([{ name: 'bomb.bin', content: zeros }])

    const result = await validateZipSafety(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('suspiciousCompressionRatio')
  })

  it('rejects a zip containing a nested zip', async () => {
    const innerZip = await buildZip([{ name: 'inner.shp', content: 'x' }])
    const zip = await buildZip([
      { name: 'boundary.shp', content: 'x' },
      { name: 'inner.zip', content: innerZip }
    ])

    const result = await validateZipSafety(zip)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('nestedZip')
    expect(result.message).toMatch(/nested zip/i)
  })

  it('rejects a zip with a zip-slip path traversal entry', async () => {
    // yazl refuses to create zips with unsafe paths, so we mock yauzl
    // directly to simulate a malicious central directory.
    const yauzlMod = await import('yauzl')
    const fakeZipfile = makeFakeZipfile([
      { fileName: '../evil.shp', uncompressedSize: 5, compressedSize: 5 }
    ])
    const spy = vi
      .spyOn(yauzlMod.default, 'fromBuffer')
      .mockImplementation((_buf, _opts, cb) => cb(null, fakeZipfile))

    const result = await validateZipSafety(Buffer.from('ignored'))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('zipSlip')

    spy.mockRestore()
  })

  it('rejects a zip with an absolute-path entry', async () => {
    const yauzlMod = await import('yauzl')
    const fakeZipfile = makeFakeZipfile([
      { fileName: '/etc/passwd', uncompressedSize: 5, compressedSize: 5 }
    ])
    const spy = vi
      .spyOn(yauzlMod.default, 'fromBuffer')
      .mockImplementation((_buf, _opts, cb) => cb(null, fakeZipfile))

    const result = await validateZipSafety(Buffer.from('ignored'))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('zipSlip')

    spy.mockRestore()
  })

  it('rejects a buffer that is not a valid zip', async () => {
    const result = await validateZipSafety(Buffer.from('not a zip file'))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('invalidZip')
  })

  it('catches a doctored entry that under-reports its size during streaming', async () => {
    // Simulate a zip whose central directory advertises a small uncompressed
    // size but whose stream actually emits much more. We do this by mocking
    // yauzl directly because yazl will not produce a malformed zip.
    const yauzlMod = await import('yauzl')
    const fakeEntry = {
      fileName: 'lying.bin',
      uncompressedSize: 100,
      compressedSize: 50
    }

    const fakeReadStream = Readable.from(
      (function* () {
        // Yield far more bytes than the per-entry cap to trip the streaming
        // check immediately.
        const chunk = Buffer.alloc(1024 * 1024)
        for (let i = 0; i < 25; i++) {
          yield chunk
        }
      })()
    )

    const fakeZipfile = {
      entryCount: 1,
      _entryEmitted: false,
      readEntry() {
        if (!this._entryEmitted) {
          this._entryEmitted = true
          this._entryHandler(fakeEntry)
        } else {
          this._endHandler()
        }
      },
      on(event, handler) {
        if (event === 'entry') {
          this._entryHandler = handler
        }
        if (event === 'end') {
          this._endHandler = handler
        }
        if (event === 'error') {
          this._errorHandler = handler
        }
      },
      openReadStream(_entry, cb) {
        cb(null, fakeReadStream)
      },
      close() {}
    }

    const spy = vi
      .spyOn(yauzlMod.default, 'fromBuffer')
      .mockImplementation((_buf, _opts, cb) => {
        cb(null, fakeZipfile)
      })

    const result = await validateZipSafety(Buffer.from('ignored'))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('entryTooLarge')

    spy.mockRestore()
  })
})
