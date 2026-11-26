import {
  ssclError,
  ssclErrorCodes
} from '../../common/helpers/sscl/sscl-errors.js'

const safeFilename = /^(?!\.{1,2}$)[\w.-]+$/

/**
 * Throws ssclErrorCodes.invalidFilename unless the name is a plain file name:
 * letters, digits, `_`, `.` and `-`, and not `.` or `..`, so it cannot leave
 * the folder it is joined to.
 * @param {string} filename
 */
export const assertSafeFilename = (filename) => {
  if (!safeFilename.test(filename)) {
    throw ssclError({
      code: ssclErrorCodes.invalidFilename,
      message: `Invalid SFTP filename ${JSON.stringify(filename)}`
    })
  }
}
