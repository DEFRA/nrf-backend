import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { generateSshTestKeyPair } from '../src/test-utils/ssh-test-keys.js'

export const sftpTestKeysDir = path.resolve('.sftp-test-keys')

const keyFiles = {
  hostPrivate: 'ssh_host_ed25519_key',
  hostPublic: 'ssh_host_ed25519_key.pub',
  clientPrivate: 'client',
  clientPublic: 'client.pub'
}

/**
 * Generates throwaway SSH keys for the local atmoz/sftp test container, once.
 * Returns true when new keys were written, so a running container can be recreated.
 */
export function ensureSftpTestKeys() {
  if (existsSync(path.join(sftpTestKeysDir, keyFiles.clientPublic))) {
    return false
  }
  mkdirSync(sftpTestKeysDir, { recursive: true })
  const host = generateSshTestKeyPair()
  const client = generateSshTestKeyPair({ comment: 'nrf-backend-test' })
  const write = (name, content, mode) =>
    writeFileSync(path.join(sftpTestKeysDir, name), `${content}\n`, { mode })
  write(keyFiles.hostPrivate, host.private, 0o600)
  write(keyFiles.hostPublic, host.public, 0o644)
  write(keyFiles.clientPrivate, client.private, 0o600)
  write(keyFiles.clientPublic, client.public, 0o644)
  return true
}

export { keyFiles as sftpTestKeyFiles }
