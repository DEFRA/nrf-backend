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
 * @returns {Promise<{geojson?: object, error?: string}>}
 */
/**
 * Find WWTW catchments near an RLB geometry
 * @param {object} geometry - RLB geometry as GeoJSON dict (EPSG:27700)
 * @returns {Promise<{nearbyWwtws?: Array, error?: string}>}
 */
export async function findNearbyWwtws(geometry) {
  const baseUrl = getImpactAssessorUrl()
  const url = `${baseUrl}/wwtw/nearby`

  logger.info(`Fetching nearby WWTWs - url: ${url}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geometry })
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const detail =
        errorBody.error ?? errorBody.detail ?? `HTTP ${response.status}`
      logger.error(
        `Nearby WWTW request failed - url: ${url}, status: ${response.status}, detail: ${detail}`
      )
      return { error: detail, statusCode: response.status }
    }

    const body = await response.json()
    return { nearbyWwtws: body.nearbyWwtws ?? [] }
  } catch (error) {
    logger.error(
      `Error calling impact assessor - url: ${url}, message: ${error?.message}`
    )
    return { error: 'Unable to contact impact assessor service' }
  }
}

export async function checkBoundary(fileBuffer, filename, contentType) {
  const baseUrl = getImpactAssessorUrl()
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
      const detail =
        errorBody.error ?? errorBody.detail ?? `HTTP ${response.status}`
      logger.error(
        `Boundary check failed - url: ${url}, status: ${response.status}, detail: ${detail}`
      )
      return {
        error: detail,
        statusCode: response.status,
        ...(errorBody.boundaryGeometryWgs84 && {
          boundaryGeometryWgs84: errorBody.boundaryGeometryWgs84
        })
      }
    }

    const geojson = await response.json()
    const {
      boundaryGeometryOriginal,
      boundaryGeometryWgs84,
      intersectingEdps
    } = geojson
    return {
      geojson: {
        boundaryGeometryOriginal,
        boundaryGeometryWgs84,
        intersectingEdps
      }
    }
  } catch (error) {
    logger.error(
      `Error calling impact assessor - url: ${url}, message: ${error?.message}`
    )
    return { error: 'Unable to contact impact assessor service' }
  }
}
