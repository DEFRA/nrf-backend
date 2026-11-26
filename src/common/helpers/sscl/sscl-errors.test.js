import {
  isFileLevelError,
  isNoSuchFileError,
  ssclError,
  ssclErrorCodes
} from './sscl-errors.js'
import { withCode } from '../../../test-utils/sscl-test-helpers.js'

const sftpNoSuchFile = withCode(2)
const sftpPermissionDenied = withCode(3)

describe('isNoSuchFileError', () => {
  it('is true for the SFTP no such file status', () => {
    expect(isNoSuchFileError(sftpNoSuchFile)).toBe(true)
  })

  it.each([
    ['another SFTP status', sftpPermissionDenied],
    ['an error with no code', new Error('ECONNRESET')],
    [
      'an SSCL error',
      ssclError({ code: ssclErrorCodes.fileExists, message: 'x' })
    ],
    ['nothing', undefined]
  ])('is false for %s', (_case, error) => {
    expect(isNoSuchFileError(error)).toBe(false)
  })
})

describe('isFileLevelError', () => {
  it.each([
    ['SFTP no such file', withCode(2)],
    ['SFTP permission denied', withCode(3)],
    ['SFTP failure', withCode(4)],
    ['SFTP bad message', withCode(5)],
    ['SFTP operation unsupported', withCode(8)],
    ...[
      ssclErrorCodes.fileExists,
      ssclErrorCodes.fileTooLarge,
      ssclErrorCodes.invalidFilename
    ].map((code) => [code, withCode(code)])
  ])('is true for %s', (_case, error) => {
    expect(isFileLevelError(error)).toBe(true)
  })

  it.each([
    ['an error with no code', new Error('ECONNRESET')],
    ['a socket error code', withCode('ECONNRESET')],
    ['SFTP no connection', withCode(6)],
    ['SFTP connection lost', withCode(7)],
    ['a timeout', withCode(ssclErrorCodes.timeout)],
    ['a closed connection', withCode(ssclErrorCodes.connectionClosed)],
    ['an empty file refusal', withCode(ssclErrorCodes.emptyFile)],
    ['a pull already in progress', withCode(ssclErrorCodes.pullInProgress)],
    ['ssh2-sftp-client not connected', withCode('ERR_NOT_CONNECTED')],
    ['nothing', undefined]
  ])('is false for %s', (_case, error) => {
    expect(isFileLevelError(error)).toBe(false)
  })
})
