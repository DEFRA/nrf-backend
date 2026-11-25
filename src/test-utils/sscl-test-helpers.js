export const ssclTestLimits = { maxFileBytes: 1024 * 1024, maxFilesPerRun: 50 }

/**
 * Wraps base64 over several lines, as it is in many key files.
 * @param {{ base64: string, width?: number }} params
 * @returns {string[]}
 */
export const wrapBase64 = ({ base64, width = 64 }) =>
  base64.match(new RegExp(`.{1,${width}}`, 'g'))

/**
 * An error carrying a code, as SFTP and socket errors do.
 * @param {number | string} code
 */
export const withCode = (code) =>
  Object.assign(new Error(`code ${code}`), { code })

/**
 * Each pulled file's name and status, in order.
 * @param {{ files: Array<{ filename: string, status: string }> }} pulled
 */
export const pulledStatuses = ({ files }) =>
  files.map(({ filename, status }) => [filename, status])

/**
 * The names of the files in a transport's pull folder.
 * @param {import('../services/sftp/sftp-transport.js').SsclTransport} transport
 */
export const pullFolderNames = async (transport) =>
  (await transport.withPullSession((session) => session.list())).map(
    (file) => file.name
  )

/**
 * Replaces some of a transport's pull session operations, e.g. to make a
 * download fail.
 * @param {{ transport: import('../services/sftp/sftp-transport.js').SsclTransport, overrides: Partial<import('../services/sftp/sftp-transport.js').PullSession> }} params
 * @returns {() => void} puts the pull session back as it was before
 */
export const overridePullSession = ({ transport, overrides }) => {
  const original = transport.withPullSession
  transport.withPullSession = (work) =>
    original((session) => work({ ...session, ...overrides }))
  return function restorePullSession() {
    transport.withPullSession = original
  }
}

/**
 * An onFile handler that keeps what it is given.
 */
export const collectPulledFiles = () => {
  const stored = []
  return {
    stored,
    onFile: async (file) => {
      stored.push(file)
    }
  }
}
