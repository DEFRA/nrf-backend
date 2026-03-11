import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Send a geometry file to the impact assessor's /check-boundary endpoint
 * @param {Buffer} fileBuffer - The file content
 * @param {string} filename - The original filename
 * @param {string} contentType - The file's content type
 * @returns {Promise<{geojson?: object, error?: string}>}
 */
export async function checkBoundary(fileBuffer, filename, contentType) {
  const baseUrl = config.get('impactAssessor.url')
  const url = `${baseUrl}/check-boundary`

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
      const detail = errorBody.detail ?? `HTTP ${response.status}`
      logger.error(
        `Boundary check failed - url: ${url}, status: ${response.status}, detail: ${detail}`
      )
      return { error: detail, statusCode: response.status }
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
