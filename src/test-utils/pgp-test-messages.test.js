import * as openpgp from 'openpgp'

import { compressedOnlyMessage } from './pgp-test-messages.js'

describe('compressedOnlyMessage', () => {
  it('gives a binary message holding only compressed data', async () => {
    const data = Buffer.from('compressed only')

    const message = await openpgp.readMessage({
      binaryMessage: await compressedOnlyMessage(data)
    })

    expect(message.packets.map((packet) => packet.constructor.tag)).toEqual([
      openpgp.enums.packet.compressedData
    ])
    expect(Buffer.from(message.getLiteralData())).toEqual(data)
  })
})
