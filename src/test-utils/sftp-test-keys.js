import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { generateSshTestKeyPair } from './ssh-test-keys.js'

/** Where the vitest global setup keeps the SFTP test container's keys. */
export const sftpTestKeysDir = path.resolve('.sftp-test-keys')

export const sftpTestKeyFiles = {
  hostPrivate: 'ssh_host_ed25519_key',
  hostPublic: 'ssh_host_ed25519_key.pub',
  clientPrivate: 'client',
  clientPublic: 'client.pub'
}

const privateFileMode = 0o600
const publicFileMode = 0o644

/**
 * Generates throwaway SSH keys for the SFTP test container, unless all four
 * key files are already there.
 * @param {{ dir?: string }} [params]
 * @returns {boolean} true when new keys were written, so a running container
 *   can be recreated with them
 */
export function ensureSftpTestKeys({ dir = sftpTestKeysDir } = {}) {
  const allPresent = Object.values(sftpTestKeyFiles).every((keyFileName) =>
    existsSync(path.join(dir, keyFileName))
  )
  if (allPresent) {
    return false
  }
  mkdirSync(dir, { recursive: true })
  const host = generateSshTestKeyPair()
  const client = generateSshTestKeyPair({ comment: 'nrf-backend-test' })
  /** @param {{ keyFileName: string, content: string, mode: number }} params */
  const write = ({ keyFileName, content, mode }) =>
    writeFileSync(path.join(dir, keyFileName), `${content}\n`, { mode })
  write({
    keyFileName: sftpTestKeyFiles.hostPrivate,
    content: host.private,
    mode: privateFileMode
  })
  write({
    keyFileName: sftpTestKeyFiles.hostPublic,
    content: host.public,
    mode: publicFileMode
  })
  write({
    keyFileName: sftpTestKeyFiles.clientPrivate,
    content: client.private,
    mode: privateFileMode
  })
  write({
    keyFileName: sftpTestKeyFiles.clientPublic,
    content: client.public,
    mode: publicFileMode
  })
  return true
}

/**
 * Reads one of the SFTP test container's key files.
 * @param {{ keyFileName: string, dir?: string }} params
 */
export const readSftpTestKey = ({ keyFileName, dir = sftpTestKeysDir }) =>
  readFileSync(path.join(dir, keyFileName), 'utf8').trim()
