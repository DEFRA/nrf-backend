const PLACEHOLDER_PATTERN = /\(\(([^()]+)\)\)/g

/**
 * Replaces every `((placeholder))` in a Notify-style email template with its
 * value, as Notify does when it sends a template.
 *
 * @param {object} params
 * @param {string} params.template
 * @param {Record<string, string | number>} params.values
 * @returns {string}
 */
export const fillEmailTemplate = ({ template, values }) =>
  template.replace(PLACEHOLDER_PATTERN, (_, name) => values[name])
