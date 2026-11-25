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
