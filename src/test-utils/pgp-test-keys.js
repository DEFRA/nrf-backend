import * as openpgp from 'openpgp'

const passphrase = 'throwaway-test-passphrase'

const generate = async (name) => {
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
 */
export const generatePgpTestKeys = async () => {
  const [nrf, ssclEncryption, ssclSigning, stranger] = await Promise.all([
    generate('NRF test'),
    generate('SSCL test encryption'),
    generate('SSCL test signing'),
    generate('Someone else')
  ])
  return { nrf, ssclEncryption, ssclSigning, stranger }
}
