/**
 * Partially masks an email address as a memory-jog for the recipient.
 * Keeps the first three characters of the local part (or fewer if the local
 * part is shorter) followed by `**`, and the full domain unchanged.
 * e.g. `adeola@example.com` → `ade**@example.com`.
 *
 * @param {string} address - the email address to mask
 * @returns {string} the masked email address
 */
const visibleLocalPartChars = 3

export const maskEmail = (address) => {
  const [localPart, domain] = address.split('@')
  return `${localPart.slice(0, visibleLocalPartChars)}**@${domain}`
}
