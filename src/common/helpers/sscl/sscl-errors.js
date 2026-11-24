export const ssclErrorCodes = {
  connectionClosed: 'SSCL_CONNECTION_CLOSED',
  emptyFile: 'SSCL_EMPTY_FILE',
  fileExists: 'SSCL_FILE_EXISTS',
  fileTooLarge: 'SSCL_FILE_TOO_LARGE',
  invalidFilename: 'SSCL_INVALID_FILENAME',
  pullInProgress: 'SSCL_PULL_IN_PROGRESS',
  pushTooLarge: 'SSCL_PUSH_TOO_LARGE',
  timeout: 'SSCL_TIMEOUT'
}

/**
 * An Error carrying one of ssclErrorCodes, so callers can tell a problem with
 * one file from a lost connection.
 * @param {{ code: string, message: string }} params
 */
export const ssclError = ({ code, message }) =>
  Object.assign(new Error(message), { code })

// SFTP status codes that ssh2 passes through on its errors.
const sftpNoSuchFile = 2
// SSH_FX_NO_CONNECTION and SSH_FX_CONNECTION_LOST: numeric, but about the
// connection, not the request.
const sftpNoConnection = 6
const sftpConnectionLost = 7
const sftpConnectionCodes = new Set([sftpNoConnection, sftpConnectionLost])

const fileLevelSsclCodes = new Set([
  ssclErrorCodes.fileTooLarge,
  ssclErrorCodes.invalidFilename,
  ssclErrorCodes.fileExists
])

/**
 * Whether an error is about one file (so other files can still be tried)
 * rather than a lost connection. A numeric code is an SFTP status the server
 * sent in answer to that request, so the connection still works, unless it
 * says the connection is gone. An error with no code, a socket error code
 * such as ECONNRESET, or a timeout (which closes the connection) means the
 * connection is lost.
 * @param {unknown} error
 */
export const isFileLevelError = (error) => {
  const code = /** @type {{ code?: string | number }} */ (error)?.code
  if (typeof code === 'number') {
    return !sftpConnectionCodes.has(code)
  }
  return fileLevelSsclCodes.has(code)
}

/**
 * Whether an error says the file is not there (SSH_FX_NO_SUCH_FILE), for
 * example because the sender renamed it or another pull removed it.
 * @param {unknown} error
 */
export const isNoSuchFileError = (error) =>
  /** @type {{ code?: string | number }} */ (error)?.code === sftpNoSuchFile
