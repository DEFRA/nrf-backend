import * as openpgp from 'openpgp'

const passphrase = 'throwaway-test-passphrase'

/**
 * Keys are ASCII-armoured.
 * @typedef {{ privateKey: string, publicKey: string, passphrase: string }} PgpTestKeyPair
 * @typedef {{
 *   nrf: PgpTestKeyPair,
 *   ssclEncryption: PgpTestKeyPair,
 *   ssclSigning: PgpTestKeyPair,
 *   stranger: PgpTestKeyPair
 * }} PgpTestKeys
 */

/**
 * A throwaway PGP key pair generated at test time.
 * @param {string} name
 * @returns {Promise<PgpTestKeyPair>}
 */
export const generatePgpTestKeyPair = async (name) => {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519Legacy',
    userIDs: [{ name, email: 'throwaway@example.com' }],
    passphrase,
    format: 'armored'
  })
  return { privateKey, publicKey, passphrase }
}

/**
 * Throwaway PGP key pairs generated at test time, standing in for NRF's key
 * pair and SSCL's encryption and signing key pairs.
 * @returns {Promise<PgpTestKeys>}
 */
export const generatePgpTestKeys = async () => {
  const [nrf, ssclEncryption, ssclSigning, stranger] = await Promise.all([
    generatePgpTestKeyPair('NRF test'),
    generatePgpTestKeyPair('SSCL test encryption'),
    generatePgpTestKeyPair('SSCL test signing'),
    generatePgpTestKeyPair('Someone else')
  ])
  return { nrf, ssclEncryption, ssclSigning, stranger }
}
