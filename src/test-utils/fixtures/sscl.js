export const ssclTestInvoiceText = 'invoices'
export const ssclTestCustomerFilename = 'rainv_NRLCUST_20261118143005.dat.pgp'
/** A reply name as SSCL might send it; SSCL's names are not agreed yet. */
export const ssclTestReplyFilename = 'SSCL_1.pgp'
/** What openpgp says about a file with no signature, or someone else's. */
export const pgpTestErrors = {
  notSigned: 'Message is not signed',
  unknownSigner: /Could not find signing key/
}
const notPgp = Buffer.from('not pgp')
/** A file NRF cannot verify. */
export const ssclTestGarbageFile = { filename: 'unsigned.pgp', data: notPgp }
/** Sorts before the startup reply, so it takes the first slot of a pull. */
export const ssclTestGarbageFirstFile = {
  filename: 'a_garbage.pgp',
  data: notPgp
}
export const fakeSsclSecondReplyFilename =
  'fake_sscl_reply_second_20261118143005.txt.pgp'
export const fakeSsclReplyTime = new Date('2026-11-18T14:30:05Z')
export const fakeSsclStartupReplyFilename =
  'fake_sscl_reply_startup_20261118143005.txt.pgp'
export const fakeSsclStartupReplyText =
  'Fake SSCL reply about startup at 2026-11-18T14:30:05.000Z\n'
/** The name of the test invoice file without its .dat.pgp extension. */
export const ssclTestInvoiceStem = 'rainv_NRLINV_20261109173005'
export const ssclTestInvoiceFilename = `${ssclTestInvoiceStem}.dat.pgp`
