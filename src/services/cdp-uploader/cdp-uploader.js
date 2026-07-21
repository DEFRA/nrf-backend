import Wreck from '@hapi/wreck'

import { withTraceId } from '@defra/hapi-tracing'
import { BOUNDARY_ERRORS } from '@defra/nrf-library'

import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()
const traceHeaderName = config.get('tracing.header')

/**
 * Get the CDP Uploader base URL
 * @returns {string}
 */
export function getCdpUploaderUrl() {
  const explicitUrl = config.get('cdpUploader.url')
  if (explicitUrl) {
    return explicitUrl
  }

  const environment = process.env.ENVIRONMENT
  if (environment) {
    return `https://cdp-uploader.${environment}.cdp-int.defra.cloud`
  }

  // Local development fallback
  return 'http://localhost:7337'
}

/**
 * Initiate an upload session with CDP Uploader
 * @param {object} options - Upload options
 * @param {string} options.redirect - URL to redirect to after upload
 * @param {string} options.s3Bucket - Destination S3 bucket
 * @param {string} [options.s3Path] - Optional path within the bucket
 * @param {object} [options.metadata] - Optional metadata
 * @param {number} [options.maxFileSize] - Maximum file size in bytes
 * @returns {Promise<{uploadId: string, uploadUrl: string} | {error: string}>}
 */
export async function initiateUpload({
  redirect,
  s3Bucket,
  s3Path,
  metadata,
  maxFileSize
}) {
  const baseUrl = getCdpUploaderUrl()
  const url = `${baseUrl}/initiate`

  logger.info(
    `Initiating upload - url: ${url}, s3Bucket: ${s3Bucket}, s3Path: ${s3Path}, maxFileSize: ${maxFileSize}`
  )

  try {
    const body = { redirect, s3Bucket, s3Path, metadata }
    if (maxFileSize != null) {
      body.maxFileSize = maxFileSize
    }

    const { payload } = await Wreck.post(url, {
      payload: JSON.stringify(body),
      headers: withTraceId(traceHeaderName, {
        'Content-Type': 'application/json'
      }),
      json: true
    })

    // Extract just the path from uploadUrl (cdp-uploader may return full URL)
    const uploadUrl = payload.uploadUrl.startsWith('http')
      ? new URL(payload.uploadUrl).pathname
      : payload.uploadUrl

    return {
      uploadId: payload.uploadId,
      uploadUrl
    }
  } catch (error) {
    const statusCode = error?.output?.statusCode
    const responsePayload = error?.data?.payload
    logger.error(
      error,
      `Error initiating upload - url: ${url}, baseUrl: ${baseUrl}, s3Bucket: ${s3Bucket}, s3Path: ${s3Path}, statusCode: ${statusCode}, responsePayload: ${JSON.stringify(responsePayload)}`
    )
    return {
      error: 'Unable to initiate upload'
    }
  }
}

/**
 * Get the upload status from CDP Uploader
 * @param {string} uploadId - The upload ID to check status for
 * @returns {Promise<{uploadStatus: string, error?: string}>}
 */
export async function getUploadStatus(uploadId) {
  const baseUrl = getCdpUploaderUrl()
  const url = `${baseUrl}/status/${uploadId}`

  logger.info(`Fetching upload status - url: ${url}, uploadId: ${uploadId}`)

  try {
    const { payload } = await Wreck.get(url, {
      json: true,
      headers: withTraceId(traceHeaderName)
    })

    return {
      uploadStatus: payload.uploadStatus ?? 'unknown'
    }
  } catch (error) {
    const statusCode = error?.output?.statusCode
    const responsePayload = error?.data?.payload
    logger.error(
      error,
      `Error fetching upload status - url: ${url}, baseUrl: ${baseUrl}, uploadId: ${uploadId}, statusCode: ${statusCode}, responsePayload: ${JSON.stringify(responsePayload)}`
    )
    return {
      uploadStatus: 'error',
      error: 'Unable to check upload status'
    }
  }
}

/**
 * Get the full upload details from CDP Uploader, including file info.
 * @param {string} uploadId - The upload ID
 * @returns {Promise<{uploadStatus: string, form?: object, error?: string}>}
 */
export async function getUploadDetails(uploadId) {
  const baseUrl = getCdpUploaderUrl()
  const url = `${baseUrl}/status/${uploadId}`

  logger.info(`Fetching upload details - url: ${url}, uploadId: ${uploadId}`)

  try {
    const { payload } = await Wreck.get(url, {
      json: true,
      headers: withTraceId(traceHeaderName)
    })

    return payload
  } catch (error) {
    const statusCode = error?.output?.statusCode
    const responsePayload = error?.data?.payload
    logger.error(
      error,
      `Error fetching upload details - url: ${url}, uploadId: ${uploadId}, statusCode: ${statusCode}, responsePayload: ${JSON.stringify(responsePayload)}`
    )
    return {
      uploadStatus: 'error',
      error: BOUNDARY_ERRORS.UPLOAD.UPLOAD_STATUS_CHECK_FAILED,
      statusCode
    }
  }
}
