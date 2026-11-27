import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  ensureSftpTestKeys,
  readSftpTestKey,
  sftpTestKeyFiles
} from './sftp-test-keys.js'

const privateFileMode = 0o600

describe('ensureSftpTestKeys', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sftp-test-keys-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a host and a client key pair, with the private keys readable only by the owner', () => {
    expect(ensureSftpTestKeys({ dir })).toBe(true)

    expect(
      readSftpTestKey({ keyFileName: sftpTestKeyFiles.clientPublic, dir })
    ).toMatch(/^ssh-ed25519 \S+ nrf-backend-test$/)
    expect(
      readSftpTestKey({ keyFileName: sftpTestKeyFiles.hostPublic, dir })
    ).toMatch(/^ssh-ed25519 /)
    for (const keyFileName of [
      sftpTestKeyFiles.hostPrivate,
      sftpTestKeyFiles.clientPrivate
    ]) {
      expect(statSync(path.join(dir, keyFileName)).mode & 0o777).toBe(
        privateFileMode
      )
    }
  })

  it('keeps the keys it wrote before', () => {
    ensureSftpTestKeys({ dir })
    const before = readSftpTestKey({
      keyFileName: sftpTestKeyFiles.clientPublic,
      dir
    })

    expect(ensureSftpTestKeys({ dir })).toBe(false)
    expect(
      readSftpTestKey({ keyFileName: sftpTestKeyFiles.clientPublic, dir })
    ).toBe(before)
  })

  it('writes new keys when one of the key files is missing', () => {
    ensureSftpTestKeys({ dir })
    rmSync(path.join(dir, sftpTestKeyFiles.hostPrivate))

    expect(ensureSftpTestKeys({ dir })).toBe(true)
    expect(
      readSftpTestKey({ keyFileName: sftpTestKeyFiles.hostPrivate, dir })
    ).toMatch(/PRIVATE KEY/)
  })

  it('makes the private keys readable only by the owner when it keeps the keys it wrote before', () => {
    ensureSftpTestKeys({ dir })
    const clientPrivate = path.join(dir, sftpTestKeyFiles.clientPrivate)
    chmodSync(clientPrivate, 0o644)

    expect(ensureSftpTestKeys({ dir })).toBe(false)
    expect(statSync(clientPrivate).mode & 0o777).toBe(privateFileMode)
  })

  it('refuses a folder where a key file should be, saying what to do', () => {
    mkdirSync(path.join(dir, sftpTestKeyFiles.hostPrivate))

    expect(() => ensureSftpTestKeys({ dir })).toThrow(
      'is a folder, not a key file. Delete the folder and run the tests again'
    )
  })

  it('writes over a private key file left with loose permissions, making it readable only by the owner', () => {
    const clientPrivate = path.join(dir, sftpTestKeyFiles.clientPrivate)
    writeFileSync(clientPrivate, 'old key')
    chmodSync(clientPrivate, 0o644)

    ensureSftpTestKeys({ dir })

    expect(statSync(clientPrivate).mode & 0o777).toBe(privateFileMode)
  })
})
