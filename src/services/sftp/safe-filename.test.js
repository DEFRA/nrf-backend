import { assertSafeFilename } from './safe-filename.js'
import { ssclErrorCodes } from '../../common/helpers/sscl/sscl-errors.js'

describe('assertSafeFilename', () => {
  it.each([['rainv_NRLINV_20261109173005.dat.pgp'], ['a-b.part'], ['.hidden']])(
    'accepts %j',
    (filename) => {
      expect(() => assertSafeFilename(filename)).not.toThrow()
    }
  )

  it.each([['../etc/passwd'], ['a/b.pgp'], [''], ['.'], ['..'], ['a b.pgp']])(
    'refuses %j',
    (filename) => {
      expect(() => assertSafeFilename(filename)).toThrow(
        expect.objectContaining({
          code: ssclErrorCodes.invalidFilename,
          message: `Invalid SFTP filename ${JSON.stringify(filename)}`
        })
      )
    }
  )
})
