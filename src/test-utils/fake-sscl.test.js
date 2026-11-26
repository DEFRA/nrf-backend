import {
  buildReply,
  fakeSsclKeysFor,
  fakeSsclReplyFaults
} from './fake-sscl.js'
import {
  fakeSsclTestMaxFileBytes as maxFileBytes,
  pushedByNrf,
  readAsNrf,
  receiveAsFakeSscl
} from './fake-sscl-test-helpers.js'
import { generatePgpTestKeys } from './pgp-test-keys.js'
import {
  fakeSsclReplyTime,
  fakeSsclStartupReplyFilename,
  fakeSsclStartupReplyText,
  ssclTestCustomerFilename,
  ssclTestInvoiceFilename,
  ssclTestInvoiceText as text
} from './fixtures/sscl.js'

const startupReply = {
  about: 'startup',
  time: fakeSsclReplyTime,
  maxFileBytes
}

describe('fake SSCL', { timeout: 20000 }, () => {
  let pgp
  let keys

  beforeAll(async () => {
    pgp = await generatePgpTestKeys()
    keys = fakeSsclKeysFor(pgp)
  })

  describe('receivePushedFile', () => {
    it.each([
      ['an invoice file', 'rainv_NRLINV_20261118143005.dat.pgp'],
      ['a customer file', ssclTestCustomerFilename]
    ])(
      'accepts %s encrypted to SSCL and signed by NRF',
      async (_case, filename) => {
        const receipt = await receiveAsFakeSscl({
          filename,
          data: await pushedByNrf({ text, pgp }),
          keys
        })

        expect(receipt).toEqual({
          accepted: true,
          problems: [],
          contents: Buffer.from(text)
        })
      }
    )

    it.each([
      ['an old test name', 'NRF_TEST_20261118143005.txt.pgp'],
      ['a timestamp without seconds', 'rainv_NRLINV_202611181430.dat.pgp'],
      ['an unknown file type', 'rainv_NRLXXX_20261118143005.dat.pgp']
    ])('rejects %s', async (_case, filename) => {
      const receipt = await receiveAsFakeSscl({
        filename,
        data: await pushedByNrf({ text, pgp }),
        keys
      })

      expect(receipt.accepted).toBe(false)
      expect(receipt.problems).toEqual([
        expect.stringMatching(/^Name does not match/)
      ])
    })

    it('rejects a name it has already received', async () => {
      const receipt = await receiveAsFakeSscl({
        data: await pushedByNrf({ text, pgp }),
        keys,
        archivedNames: new Set([ssclTestInvoiceFilename])
      })

      expect(receipt.problems).toEqual([
        'A file with this name was already received'
      ])
    })

    it('rejects an empty file', async () => {
      const receipt = await receiveAsFakeSscl({ data: Buffer.alloc(0), keys })

      expect(receipt).toEqual({ accepted: false, problems: ['File is empty'] })
    })

    it('rejects a file whose decrypted contents are empty', async () => {
      const receipt = await receiveAsFakeSscl({
        data: await pushedByNrf({ text: '', pgp }),
        keys
      })

      expect(receipt.problems).toEqual(['Decrypted contents are empty'])
    })

    it.each([
      ['not PGP', async () => Buffer.from('plain')],
      [
        'encrypted to someone else',
        () => pushedByNrf({ text, pgp, encryptionKey: pgp.stranger.publicKey })
      ],
      [
        'signed by someone else',
        () => pushedByNrf({ text, pgp, signer: pgp.stranger })
      ]
    ])('rejects a file that is %s', async (_case, build) => {
      const receipt = await receiveAsFakeSscl({ data: await build(), keys })

      expect(receipt.accepted).toBe(false)
      expect(receipt.problems).toEqual([
        expect.stringMatching(/^Not encrypted to SSCL and signed by NRF/)
      ])
    })
  })

  describe('buildReply', () => {
    it('builds a reply NRF can decrypt and verify as signed by SSCL', async () => {
      const { filename, data } = await buildReply({ ...startupReply, keys })

      expect(filename).toBe(fakeSsclStartupReplyFilename)
      expect((await readAsNrf({ data, pgp })).toString()).toBe(
        fakeSsclStartupReplyText
      )
    })

    it.each([fakeSsclReplyFaults.unsigned, fakeSsclReplyFaults.wrongKey])(
      'builds a %s that NRF cannot verify',
      async (fault) => {
        const { data } = await buildReply({ ...startupReply, keys, fault })

        await expect(readAsNrf({ data, pgp })).rejects.toThrow()
      }
    )

    it('builds an oversized reply bigger than the file size limit', async () => {
      const { data } = await buildReply({
        ...startupReply,
        keys,
        fault: fakeSsclReplyFaults.oversized
      })

      expect(data.length).toBe(maxFileBytes + 1)
    })
  })
})
