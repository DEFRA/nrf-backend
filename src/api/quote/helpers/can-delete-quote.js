/**
 * Determines whether a quote may be deleted based on its creator's email.
 *
 * Outside production any quote can be deleted — non-genuine quotes from
 * testing and operational activity are fair game. In production only quotes
 * created with an approved internal address can be deleted, so genuine
 * developer activity cannot be removed from the admin UI. An empty pattern
 * list in production disables deletion entirely (fail-safe).
 *
 * @param {object} params
 * @param {string | null | undefined} params.email - quote creator's email address
 * @param {string[]} params.patterns - approved email addresses or @domain suffixes
 * @param {boolean} params.isProd - whether the running environment is production
 * @returns {boolean} whether the quote is eligible for deletion
 */
export const canDeleteQuote = ({ email, patterns, isProd }) => {
  if (!isProd) {
    return true
  }

  if (!email) {
    return false
  }

  const normalisedEmail = email.toLowerCase()

  return patterns.some((pattern) => {
    const normalisedPattern = pattern.trim().toLowerCase()

    return normalisedPattern.startsWith('@')
      ? normalisedEmail.endsWith(normalisedPattern)
      : normalisedEmail === normalisedPattern
  })
}
