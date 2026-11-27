import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

import { generateSshTestKeyPair } from './ssh-test-keys.js'

/**
 * Where the vitest global setup keeps the SFTP test container's keys: the repo
 * root, where compose.test.yml mounts them from.
 */
export const sftpTestKeysDir = path.resolve(
  import.meta.dirname,
  '../../.sftp-test-keys'
)

export const sftpTestKeyFiles = {
  hostPrivate: 'ssh_host_ed25519_key',
  hostPublic: 'ssh_host_ed25519_key.pub',
  clientPrivate: 'client',
  clientPublic: 'client.pub'
}

const privateFileMode = 0o600
const publicFileMode = 0o644

/**
 * Whether a key file is there. A folder in its place, as Docker makes for a
 * missing mount, is refused with what to do about it.
 * @param {string} file
 */
const isKeyFilePresent = (file) => {
  const stats = statSync(file, { throwIfNoEntry: false })
  if (stats?.isDirectory()) {
    throw new Error(
      `${file} is a folder, not a key file. Delete the folder and run the tests again`
    )
  }
  return stats !== undefined
}

/**
 * Generates throwaway SSH keys for the SFTP test container, unless all four
 * key files are already there. Either way, the private keys end up readable
 * only by the owner.
 * @param {{ dir?: string }} [params]
 * @returns {boolean} true when new keys were written, so a running container
 *   can be recreated with them
 */
export function ensureSftpTestKeys({ dir = sftpTestKeysDir } = {}) {
  const allPresent = Object.values(sftpTestKeyFiles).every((keyFileName) =>
    isKeyFilePresent(path.join(dir, keyFileName))
  )
  if (allPresent) {
    for (const keyFileName of [
      sftpTestKeyFiles.hostPrivate,
      sftpTestKeyFiles.clientPrivate
    ]) {
      chmodSync(path.join(dir, keyFileName), privateFileMode)
    }
    return false
  }
  mkdirSync(dir, { recursive: true })
  const host = generateSshTestKeyPair()
  const client = generateSshTestKeyPair({ comment: 'nrf-backend-test' })
  const keyFiles = [
    {
      keyFileName: sftpTestKeyFiles.hostPrivate,
      content: host.private,
      mode: privateFileMode
    },
    {
      keyFileName: sftpTestKeyFiles.hostPublic,
      content: host.public,
      mode: publicFileMode
    },
    {
      keyFileName: sftpTestKeyFiles.clientPrivate,
      content: client.private,
      mode: privateFileMode
    },
    {
      keyFileName: sftpTestKeyFiles.clientPublic,
      content: client.public,
      mode: publicFileMode
    }
  ]
  for (const { keyFileName, content, mode } of keyFiles) {
    const file = path.join(dir, keyFileName)
    writeFileSync(file, `${content}\n`)
    // The mode given to writeFileSync applies only to a new file
    chmodSync(file, mode)
  }
  return true
}

/**
 * Reads one of the SFTP test container's key files.
 * @param {{ keyFileName: string, dir?: string }} params
 */
export const readSftpTestKey = ({ keyFileName, dir = sftpTestKeysDir }) =>
  readFileSync(path.join(dir, keyFileName), 'utf8').trim()
