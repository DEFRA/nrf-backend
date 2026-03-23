import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Get the impact assessor base URL
 * @returns {string}
 */
export function getImpactAssessorUrl() {
  const explicitUrl = config.get('impactAssessor.url')
  if (explicitUrl) {
    return explicitUrl
  }

  const environment = process.env.ENVIRONMENT
  if (environment) {
    return `https://nrf-impact-assessor.${environment}.cdp-int.defra.cloud`
  }

  // Local development fallback
  return 'http://localhost:8085'
}

/**
 * Send a geometry file to the impact assessor's /check-boundary endpoint
 * @param {Buffer} fileBuffer - The file content
 * @param {string} filename - The original filename
 * @param {string} contentType - The file's content type
 * @param {object} [options] - Optional parameters
 * @param {string} [options.proj] - Output projection (e.g. 'EPSG:4326')
 * @returns {Promise<{geojson?: object, error?: string}>}
 */
export async function checkBoundary(
  fileBuffer,
  filename,
  contentType,
  { proj } = {}
) {
  const baseUrl = getImpactAssessorUrl()
  const query = proj ? `?proj=${encodeURIComponent(proj)}` : ''
  const url = `${baseUrl}/check-boundary${query}`

  logger.info(
    `Sending boundary check - url: ${url}, filename: ${filename}, size: ${fileBuffer.length}`
  )

  const formData = new FormData()
  const blob = new Blob([fileBuffer], { type: contentType })
  formData.append('geometry_file', blob, filename)

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const detail =
        errorBody.error ?? errorBody.detail ?? `HTTP ${response.status}`
      logger.error(
        `Boundary check failed - url: ${url}, status: ${response.status}, detail: ${detail}`
      )
      return {
        error: detail,
        statusCode: response.status,
        ...(errorBody.geometry && { geometry: errorBody.geometry })
      }
    }

    const geojson = await response.json()
    return { geojson }
  } catch (error) {
    logger.error(
      `Error calling impact assessor - url: ${url}, message: ${error?.message}`
    )
    return { error: 'Unable to contact impact assessor service' }
  }
}
