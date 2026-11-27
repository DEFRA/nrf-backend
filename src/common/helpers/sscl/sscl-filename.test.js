import { ssclFilename } from './sscl-filename.js'
import {
  ssclTestCustomerFilename,
  ssclTestInvoiceFilename
} from '../../../test-utils/fixtures/sscl.js'

describe('ssclFilename', () => {
  it.each([
    ['NRLINV', '2026-11-09T17:30:05.987Z', ssclTestInvoiceFilename],
    ['NRLCUST', '2026-11-18T14:30:05.123Z', ssclTestCustomerFilename]
  ])(
    'names a %s file by its UTC time to the second',
    (fileType, isoTime, expected) => {
      expect(ssclFilename({ fileType, time: new Date(isoTime) })).toBe(expected)
    }
  )
})
