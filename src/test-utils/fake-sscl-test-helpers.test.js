import { decryptAndVerify } from '../common/helpers/sscl/pgp.js'
import { buildReply, fakeSsclKeysFor } from './fake-sscl.js'
import {
  fakeSsclTestMaxFileBytes,
  pushedByNrf,
  readAsNrf,
  receiveAsFakeSscl
} from './fake-sscl-test-helpers.js'
import { ssclTestInvoiceFilename } from './fixtures/sscl.js'
import { generatePgpTestKeys } from './pgp-test-keys.js'

const text = 'invoices'
const otherFilename = 'rainv_NRLCUST_20261118143005.dat.pgp'

describe('fake SSCL test helpers', { timeout: 20000 }, () => {
  let pgp
  let keys

  beforeAll(async () => {
    pgp = await generatePgpTestKeys()
    keys = fakeSsclKeysFor(pgp)
  })

  describe('pushedByNrf', () => {
    it.each([
      [
        'to SSCL as NRF unless told otherwise',
        () => ({
          options: {},
          recipient: pgp.ssclEncryption,
          signer: pgp.nrf
        })
      ],
      [
        'to another recipient when given one',
        () => ({
          options: { encryptionKey: pgp.stranger.publicKey },
          recipient: pgp.stranger,
          signer: pgp.nrf
        })
      ],
      [
        'as another signer when given one',
        () => ({
          options: { signer: pgp.stranger },
          recipient: pgp.ssclEncryption,
          signer: pgp.stranger
        })
      ]
    ])('encrypts and signs %s', async (_case, expected) => {
      const { options, recipient, signer } = expected()

      const data = await pushedByNrf({ text, pgp, ...options })

      const contents = await decryptAndVerify({
        data,
        decryptionKey: recipient.privateKey,
        passphrase: recipient.passphrase,
        verificationKey: signer.publicKey,
        maxDecompressedBytes: fakeSsclTestMaxFileBytes
      })
      expect(contents.toString()).toBe(text)
    })
  })

  describe('receiveAsFakeSscl', () => {
    it('receives a file as the fake SSCL holding the given keys', async () => {
      const receipt = await receiveAsFakeSscl({
        data: await pushedByNrf({ text, pgp }),
        keys
      })

      expect(receipt).toEqual({
        accepted: true,
        problems: [],
        contents: Buffer.from(text)
      })
    })

    it('receives under the test invoice name unless given another', async () => {
      const archivedNames = new Set([ssclTestInvoiceFilename])
      const data = await pushedByNrf({ text, pgp })

      const underDefaultName = await receiveAsFakeSscl({
        data,
        keys,
        archivedNames
      })
      const underOtherName = await receiveAsFakeSscl({
        data,
        keys,
        archivedNames,
        filename: otherFilename
      })

      expect(underDefaultName.problems).toEqual([
        'A file with this name was already received'
      ])
      expect(underOtherName.problems).toEqual([])
    })
  })

  describe('readAsNrf', () => {
    it('reads a reply that is encrypted to NRF and signed by SSCL', async () => {
      const reply = await buildReply({
        about: 'startup',
        time: new Date('2026-11-18T14:30:05Z'),
        keys,
        maxFileBytes: fakeSsclTestMaxFileBytes
      })

      const contents = await readAsNrf({ data: reply.data, pgp })

      expect(contents.toString()).toBe(
        'Fake SSCL reply about startup at 2026-11-18T14:30:05.000Z\n'
      )
    })

    it('refuses a file that SSCL did not sign', async () => {
      const data = await pushedByNrf({
        text,
        pgp,
        encryptionKey: pgp.nrf.publicKey
      })

      await expect(readAsNrf({ data, pgp })).rejects.toThrow()
    })
  })
})
