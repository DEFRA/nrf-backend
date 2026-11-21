import ssh2 from 'ssh2'

import { generateSshTestKeyPair } from './ssh-test-keys.js'

describe('generateSshTestKeyPair', () => {
  it('returns key pairs ssh2 can read back', () => {
    for (let i = 0; i < 400; i++) {
      const keys = generateSshTestKeyPair()
      expect(ssh2.utils.parseKey(keys.private)).not.toBeInstanceOf(Error)
      expect(keys.public).toMatch(/^ssh-ed25519 /)
    }
  })

  it('skips a key that ssh2 cannot read', () => {
    const unreadable = { private: 'junk', public: 'junk' }
    const readable = generateSshTestKeyPair()
    const generate = vi
      .spyOn(ssh2.utils, 'generateKeyPairSync')
      .mockReturnValueOnce(unreadable)
      .mockReturnValueOnce(readable)
    try {
      expect(generateSshTestKeyPair()).toBe(readable)
      expect(generate).toHaveBeenCalledTimes(2)
    } finally {
      generate.mockRestore()
    }
  })

  it('keeps the comment', () => {
    expect(generateSshTestKeyPair({ comment: 'moveit' }).public).toMatch(
      / moveit$/
    )
  })
})
