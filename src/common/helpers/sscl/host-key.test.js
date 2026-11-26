import { createHash } from 'node:crypto'

import { createHostVerifier } from './host-key.js'
import { generateSshTestKeyPair } from '../../../test-utils/ssh-test-keys.js'
import { wrapBase64 } from '../../../test-utils/sscl-test-helpers.js'

const toBlob = (openSshLine) => Buffer.from(openSshLine.split(' ')[1], 'base64')

const pinned = generateSshTestKeyPair({ comment: 'moveit' })
const other = generateSshTestKeyPair()
const pinnedBlob = toBlob(pinned.public)
const fingerprint = `SHA256:${createHash('sha256').update(pinnedBlob).digest('base64').replace(/=+$/, '')}`
const rfc4716 = [
  '---- BEGIN SSH2 PUBLIC KEY ----',
  'Comment: "moveit"',
  ...wrapBase64({ base64: pinned.public.split(' ')[1], width: 70 }),
  '---- END SSH2 PUBLIC KEY ----'
].join('\r\n')

describe('createHostVerifier', () => {
  it.each([
    ['an OpenSSH public key line', pinned.public],
    ['an RFC 4716 public key block', rfc4716],
    ['a SHA256 fingerprint', fingerprint]
  ])('accepts the pinned host key given as %s', (_format, hostKey) => {
    const verify = createHostVerifier(hostKey)

    expect(verify(pinnedBlob)).toBe(true)
  })

  it.each([
    ['an OpenSSH public key line', pinned.public],
    ['an RFC 4716 public key block', rfc4716],
    ['a SHA256 fingerprint', fingerprint]
  ])(
    'rejects a host key that does not match the pinned key given as %s',
    (_format, hostKey) => {
      const verify = createHostVerifier(hostKey)

      expect(verify(toBlob(other.public))).toBe(false)
    }
  )

  it('skips RFC 4716 headers continued onto the next line', () => {
    const continued = rfc4716.replace(
      'Comment: "moveit"',
      'Comment: "moveit \\\r\nhost key"'
    )

    expect(createHostVerifier(continued)(pinnedBlob)).toBe(true)
  })

  it.each([
    ['a bare base64 key with no type', pinned.public.split(' ')[1]],
    ['an RFC 4716 block with no key lines', '---- BEGIN ----\n---- END ----']
  ])('says what is wrong with %s', (_case, hostKey) => {
    expect(() => createHostVerifier(hostKey)).toThrow(
      'SFTP host key must be an OpenSSH public key line, an RFC 4716 block or a SHA256 fingerprint'
    )
  })

  it.each([[''], ['   '], [undefined]])(
    'refuses to build a verifier without a pinned host key (%j)',
    (hostKey) => {
      expect(() => createHostVerifier(hostKey)).toThrow(
        'SFTP host key is not configured'
      )
    }
  )
})
