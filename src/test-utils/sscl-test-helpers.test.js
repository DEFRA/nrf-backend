import { fakeSsclStartupReplyFilename } from './fixtures/sscl.js'
import { createInMemorySsclClient } from './in-memory-sscl.js'
import {
  collectPulledFiles,
  overridePullSession,
  pulledStatuses,
  pullFolderNames,
  withCode,
  wrapBase64
} from './sscl-test-helpers.js'

describe('wrapBase64', () => {
  it('splits base64 into lines of 64 characters', () => {
    expect(wrapBase64({ base64: 'a'.repeat(70) })).toEqual([
      'a'.repeat(64),
      'a'.repeat(6)
    ])
  })

  it('splits at another width when given one', () => {
    expect(wrapBase64({ base64: 'abcde', width: 2 })).toEqual(['ab', 'cd', 'e'])
  })
})

describe('withCode', () => {
  it('gives an error carrying the code', () => {
    const error = withCode(4)

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(4)
  })
})

describe('pulledStatuses', () => {
  it("gives each file's name and status, in the order pulled", () => {
    const pulled = {
      files: [
        { filename: 'b.txt.pgp', status: 'received', size: 3 },
        { filename: 'a.txt.pgp', status: 'gone', size: 5 }
      ]
    }

    expect(pulledStatuses(pulled)).toEqual([
      ['b.txt.pgp', 'received'],
      ['a.txt.pgp', 'gone']
    ])
  })
})

describe('collectPulledFiles', () => {
  it('keeps each file its handler is given, in order', async () => {
    const { stored, onFile } = collectPulledFiles()

    await onFile({ filename: 'b.txt.pgp' })
    await onFile({ filename: 'a.txt.pgp' })

    expect(stored).toEqual([
      { filename: 'b.txt.pgp' },
      { filename: 'a.txt.pgp' }
    ])
  })
})

describe('pull folder helpers', () => {
  let transport

  beforeEach(async () => {
    ;({
      sscl: { transport }
    } = await createInMemorySsclClient())
  })

  it('pullFolderNames gives the names of the files in the pull folder', async () => {
    expect(await pullFolderNames(transport)).toEqual([
      fakeSsclStartupReplyFilename
    ])
  })

  it('overridePullSession replaces the given operation and leaves the rest', async () => {
    overridePullSession({
      transport,
      overrides: {
        download: async () => {
          throw withCode(4)
        }
      }
    })

    await expect(
      transport.withPullSession((session) =>
        session.download({
          filename: fakeSsclStartupReplyFilename,
          maxBytes: 100
        })
      )
    ).rejects.toMatchObject({ code: 4 })
    expect(await pullFolderNames(transport)).toEqual([
      fakeSsclStartupReplyFilename
    ])
  })

  it('overridePullSession gives back a way to undo the override', async () => {
    const restorePullSession = overridePullSession({
      transport,
      overrides: { list: async () => [] }
    })
    const overridden = await pullFolderNames(transport)

    restorePullSession()

    expect(overridden).toEqual([])
    expect(await pullFolderNames(transport)).toEqual([
      fakeSsclStartupReplyFilename
    ])
  })
})
