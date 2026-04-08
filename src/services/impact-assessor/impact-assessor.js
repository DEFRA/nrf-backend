import { getTraceId } from '@defra/hapi-tracing'

import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const tracingHeader = config.get('tracing.header')

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
 * Find Waste Water Treatment Works catchments near an RLB geometry
 * @param {object} geometry - RLB geometry as GeoJSON dict (EPSG:27700)
 * @returns {Promise<{nearbyWwtws?: Array, error?: string}>}
 */
export async function findNearbyWasteWaterTreatmentWorks(geometry) {
  const baseUrl = getImpactAssessorUrl()
  const url = `${baseUrl}/wwtw/nearby`

  logger.info(`Fetching nearby WWTWs - url: ${url}`)

  try {
    const traceId = getTraceId()
    const headers = { 'Content-Type': 'application/json' }
    if (traceId) {
      headers[tracingHeader] = traceId
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
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

/**
 * Send a geometry file to the impact assessor's /check-boundary endpoint
 * @param {Buffer} fileBuffer - The file content
 * @param {string} filename - The original filename
 * @param {string} contentType - The file's content type
 * @returns {Promise<{geojson?: object, error?: string}>}
 */
export async function checkBoundary(fileBuffer, filename, contentType) {
  const blob = new Blob([fileBuffer], { type: contentType })
  return postBoundaryCheck(blob, filename, fileBuffer.length)
}

/**
 * Send an in-memory GeoJSON geometry to the impact assessor's /check-boundary
 * endpoint by wrapping it as a synthetic .geojson upload. This lets the backend
 * expose a JSON-body API without changing the IA's file-based contract.
 * @param {object} geometry - GeoJSON geometry or Feature/FeatureCollection
 * @returns {Promise<{geojson?: object, error?: string}>}
 */
export async function checkBoundaryGeometry(geometry) {
  const json = JSON.stringify(geometry)
  const blob = new Blob([json], { type: 'application/geo+json' })
  // Synthetic filename — the IA only uses the extension to choose a parser.
  return postBoundaryCheck(blob, 'input.geojson', json.length)
}

async function postBoundaryCheck(blob, filename, size) {
  const baseUrl = getImpactAssessorUrl()
  const url = `${baseUrl}/check-boundary`

  logger.info(
    `Sending boundary check - url: ${url}, filename: ${filename}, size: ${size}`
  )

  const formData = new FormData()
  formData.append('geometry_file', blob, filename)

  try {
    const traceId = getTraceId()
    const headers = {}
    if (traceId) {
      headers[tracingHeader] = traceId
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
