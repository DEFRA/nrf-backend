import yazl from 'yazl'

/**
 * Build a zip in memory from a list of `{ name, content }` entries.
 * @param {Array<{name: string, content: Buffer | string}>} entries
 * @returns {Promise<Buffer>}
 */
export function buildZip(entries) {
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
