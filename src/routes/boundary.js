import joi from 'joi'

import { getUploadDetails } from '../services/cdp-uploader/cdp-uploader.js'
import { downloadFromS3 } from '../services/s3/s3-client.js'
import { checkBoundary } from '../services/impact-assessor/impact-assessor.js'
import { config } from '../config.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * @openapi
 * /boundary/check/{uploadId}:
 *   post:
 *     tags:
 *       - Boundary
 *     summary: Check an uploaded boundary file
 *     description: >
 *       Downloads the uploaded file from S3 and sends it to the
 *       impact assessor for geometry validation. Returns the
 *       extracted GeoJSON on success.
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: proj
 *         required: false
 *         schema:
 *           type: string
 *           enum:
 *             - EPSG:4326
 *             - EPSG:27700
 *         description: Output projection for geometry
 *     responses:
 *       200:
 *         description: Boundary geometry as GeoJSON
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid or unreadable geometry file
 *       404:
 *         description: Upload not found or not ready
 *       502:
 *         description: Impact assessor service error
 */
const checkBoundaryRoute = {
  method: 'POST',
  path: '/boundary/check/{uploadId}',
  options: {
    validate: {
      params: joi.object({
        uploadId: joi.string().uuid().required()
      }),
      query: joi.object({
        proj: joi.string().valid('EPSG:4326', 'EPSG:27700').optional()
      })
    }
  },
  handler: async (request, h) => {
    const { uploadId } = request.params
    const { proj } = request.query

    // 1. Get upload details from CDP Uploader
    const uploadDetails = await getUploadDetails(uploadId)

    if (uploadDetails.error) {
      const statusCode = uploadDetails.statusCode ?? statusCodes.notFound
      return h.response({ error: uploadDetails.error }).code(statusCode)
    }

    if (uploadDetails.uploadStatus !== 'ready') {
      return h
        .response({
          error: `Upload is not ready (status: ${uploadDetails.uploadStatus})`
        })
        .code(statusCodes.badRequest)
    }

    // 2. Extract file info from upload details
    const form = uploadDetails.form
    const fileInfo = form?.file
    if (!fileInfo?.s3Key) {
      logger.error(
        `No file info in upload details - uploadId: ${uploadId}, form: ${JSON.stringify(form)}`
      )
      return h
        .response({ error: 'No file found for this upload' })
        .code(statusCodes.notFound)
    }

    const bucket = fileInfo.s3Bucket ?? config.get('cdpUploader.bucket')

    // 3. Download file from S3
    let fileData
    try {
      fileData = await downloadFromS3(bucket, fileInfo.s3Key)
    } catch (error) {
      logger.error(
        `Failed to download file from S3 - bucket: ${bucket}, key: ${fileInfo.s3Key}, message: ${error?.message}`
      )
      return h
        .response({ error: 'Failed to retrieve uploaded file' })
        .code(statusCodes.badGateway)
    }

    // 4. Send to impact assessor for boundary check
    const filename = fileInfo.filename ?? fileData.filename
    const contentType = fileInfo.contentType ?? fileData.contentType
    const result = await checkBoundary(fileData.body, filename, contentType, {
      proj
    })

    if (result.error) {
      const statusCode = result.statusCode ?? statusCodes.badGateway
      return h.response({ error: result.error }).code(statusCode)
    }

    return h.response(result.geojson)
  }
}

export { checkBoundaryRoute }
