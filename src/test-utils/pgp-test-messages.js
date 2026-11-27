import * as openpgp from 'openpgp'

/**
 * A message that is only compressed: not encrypted and not signed. A sender
 * can put one in the pull folder without holding any key.
 * @param {Buffer} data
 * @returns {Promise<Buffer>}
 */
export const compressedOnlyMessage = async (data) => {
  const message = await openpgp.createMessage({ binary: data })
  const reader = message
    .compress(openpgp.enums.compression.zlib)
    .write()
    .getReader()
  const chunks = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return Buffer.concat(chunks)
    }
    chunks.push(Buffer.from(value))
  }
}
