import ssh2 from 'ssh2'

/** Far more than ever needed: about 1 in 200 keys is unreadable. */
const maxAttempts = 20

/**
 * Generates a throwaway ed25519 SSH key pair that ssh2 can read back. About 1
 * in 200 private keys from ssh2's own generator fails its own parser
 * ("Malformed OpenSSH private key"), which made tests fail at random.
 * @param {{ comment?: string }} [options]
 * @returns {{ private: string, public: string }}
 */
export function generateSshTestKeyPair({ comment } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const keys = ssh2.utils.generateKeyPairSync('ed25519', { comment })
    if (!(ssh2.utils.parseKey(keys.private) instanceof Error)) {
      return keys
    }
  }
  throw new Error(`No readable SSH key after ${maxAttempts} attempts`)
}
