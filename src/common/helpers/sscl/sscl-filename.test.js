import { ssclFilename } from './sscl-filename.js'

describe('ssclFilename', () => {
  it.each([
    ['NRLINV', 'rainv_NRLINV_20261109173005.dat.pgp'],
    ['NRLCUST', 'rainv_NRLCUST_20261109173005.dat.pgp']
  ])('names a %s file by its UTC time to the second', (fileType, expected) => {
    const time = new Date('2026-11-09T17:30:05.987Z')

    expect(ssclFilename({ fileType, time })).toBe(expected)
  })
})
