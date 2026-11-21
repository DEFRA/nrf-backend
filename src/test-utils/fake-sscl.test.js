import {
  buildReply,
  fakeSsclKeysFor,
  fakeSsclReplyFaults,
  receivePushedFile
} from './fake-sscl.js'
import { generatePgpTestKeys } from './pgp-test-keys.js'
import { ssclTestInvoiceFilename } from './fixtures/sscl.js'
import { decryptAndVerify, encryptAndSign } from '../common/helpers/sscl/pgp.js'

const maxFileBytes = 1024
const time = new Date('2026-11-18T14:30:05Z')

describe('fake SSCL', { timeout: 20000 }, () => {
  let pgp
  let keys

  beforeAll(async () => {
    pgp = await generatePgpTestKeys()
    keys = fakeSsclKeysFor(pgp)
  })

  const sentByNrf = (text, { encryptionKey } = {}) =>
    encryptAndSign({
      data: Buffer.from(text),
      encryptionKey: encryptionKey ?? pgp.ssclEncryption.publicKey,
      signingKey: pgp.nrf.privateKey,
      passphrase: pgp.nrf.passphrase
    })

  const receive = ({
    filename = ssclTestInvoiceFilename,
    data,
    archivedNames = new Set()
  }) => receivePushedFile({ filename, data, keys, maxFileBytes, archivedNames })

  describe('receivePushedFile', () => {
    it.each([
      ['an invoice file', 'rainv_NRLINV_20261118143005.dat.pgp'],
      ['a customer file', 'rainv_NRLCUST_20261118143005.dat.pgp']
    ])(
      'accepts %s encrypted to SSCL and signed by NRF',
      async (_case, filename) => {
        const receipt = await receive({
          filename,
          data: await sentByNrf('data')
        })

        expect(receipt).toEqual({
          accepted: true,
          problems: [],
          contents: Buffer.from('data')
        })
      }
    )

    it.each([
      ['an old test name', 'NRF_TEST_20261118143005.txt.pgp'],
      ['a timestamp without seconds', 'rainv_NRLINV_202611181430.dat.pgp'],
      ['an unknown file type', 'rainv_NRLXXX_20261118143005.dat.pgp']
    ])('rejects %s', async (_case, filename) => {
      const receipt = await receive({ filename, data: await sentByNrf('data') })

      expect(receipt.accepted).toBe(false)
      expect(receipt.problems).toEqual([
        expect.stringMatching(/^Name does not match/)
      ])
    })

    it('rejects a name it has already received', async () => {
      const receipt = await receive({
        data: await sentByNrf('data'),
        archivedNames: new Set([ssclTestInvoiceFilename])
      })

      expect(receipt.problems).toEqual([
        'A file with this name was already received'
      ])
    })

    it('rejects an empty file', async () => {
      const receipt = await receive({ data: Buffer.alloc(0) })

      expect(receipt).toEqual({ accepted: false, problems: ['File is empty'] })
    })

    it('rejects a file whose decrypted contents are empty', async () => {
      const receipt = await receive({ data: await sentByNrf('') })

      expect(receipt.problems).toEqual(['Decrypted contents are empty'])
    })

    it.each([
      ['not PGP', async () => Buffer.from('plain')],
      [
        'encrypted to someone else',
        () => sentByNrf('data', { encryptionKey: pgp.stranger.publicKey })
      ],
      [
        'signed by someone else',
        () =>
          encryptAndSign({
            data: Buffer.from('data'),
            encryptionKey: pgp.ssclEncryption.publicKey,
            signingKey: pgp.stranger.privateKey,
            passphrase: pgp.stranger.passphrase
          })
      ]
    ])('rejects a file that is %s', async (_case, build) => {
      const receipt = await receive({ data: await build() })

      expect(receipt.accepted).toBe(false)
      expect(receipt.problems).toEqual([
        expect.stringMatching(/^Not encrypted to SSCL and signed by NRF/)
      ])
    })
  })

  describe('buildReply', () => {
    const reply = (fault) =>
      buildReply({ about: 'startup', time, keys, maxFileBytes, fault })

    const readAsNrf = (data) =>
      decryptAndVerify({
        data,
        decryptionKey: pgp.nrf.privateKey,
        passphrase: pgp.nrf.passphrase,
        verificationKey: pgp.ssclSigning.publicKey,
        maxDecompressedBytes: maxFileBytes
      })

    it('builds a reply NRF can decrypt and verify as signed by SSCL', async () => {
      const { filename, data } = await reply()

      expect(filename).toBe('fake_sscl_reply_startup_20261118143005.txt.pgp')
      expect((await readAsNrf(data)).toString()).toBe(
        'Fake SSCL reply about startup at 2026-11-18T14:30:05.000Z\n'
      )
    })

    it.each([fakeSsclReplyFaults.unsigned, fakeSsclReplyFaults.wrongKey])(
      'builds a %s that NRF cannot verify',
      async (fault) => {
        const { data } = await reply(fault)

        await expect(readAsNrf(data)).rejects.toThrow()
      }
    )

    it('builds an oversized reply bigger than the file size limit', async () => {
      const { data } = await reply(fakeSsclReplyFaults.oversized)

      expect(data.length).toBe(maxFileBytes + 1)
    })
  })
})
