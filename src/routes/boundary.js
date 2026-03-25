import joi from 'joi'

import { getUploadDetails } from '../services/cdp-uploader/cdp-uploader.js'
import { downloadFromS3 } from '../services/s3/s3-client.js'
import { checkBoundary } from '../services/impact-assessor/impact-assessor.js'
import { config } from '../config.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

async function getFileFromUpload(uploadId, h) {
  const uploadDetails = await getUploadDetails(uploadId)

  if (uploadDetails.error) {
    const statusCode = uploadDetails.statusCode ?? statusCodes.notFound
    return {
      error: h.response({ error: uploadDetails.error }).code(statusCode)
    }
  }

  if (uploadDetails.uploadStatus !== 'ready') {
    return {
      error: h
        .response({
          error: `Upload is not ready (status: ${uploadDetails.uploadStatus})`
        })
        .code(statusCodes.badRequest)
    }
  }

  const form = uploadDetails.form
  const fileInfo = form?.file
  if (!fileInfo?.s3Key) {
    logger.error(
      `No file info in upload details - uploadId: ${uploadId}, form: ${JSON.stringify(form)}`
    )
    return {
      error: h
        .response({ error: 'No file found for this upload' })
        .code(statusCodes.notFound)
    }
  }

  return { fileInfo }
}

async function downloadFile(fileInfo, h) {
  const bucket = fileInfo.s3Bucket ?? config.get('cdpUploader.bucket')

  try {
    const fileData = await downloadFromS3(bucket, fileInfo.s3Key)
    return { fileData }
  } catch (error) {
    logger.error(
      `Failed to download file from S3 - bucket: ${bucket}, key: ${fileInfo.s3Key}, message: ${error?.message}`
    )
    return {
      error: h
        .response({ error: 'Failed to retrieve uploaded file' })
        .code(statusCodes.badGateway)
    }
  }
}

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
 *         description: The ID of the upload to check
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
      })
    }
  },
  handler: async (request, h) => {
    const { uploadId } = request.params

    const upload = await getFileFromUpload(uploadId, h)
    if (upload.error) {
      return upload.error
    }

    const download = await downloadFile(upload.fileInfo, h)
    if (download.error) {
      return download.error
    }

    const { fileInfo } = upload
    const { fileData } = download
    const filename = fileInfo.filename ?? fileData.filename
    const contentType = fileInfo.contentType ?? fileData.contentType
    const result = await checkBoundary(fileData.body, filename, contentType)

    if (result.error) {
      const statusCode = result.statusCode ?? statusCodes.badGateway
      const response = { error: result.error }
      if (result.geometry) {
        response.geometry = result.geometry
      }
      return h.response(response).code(statusCode)
    }

    return h.response(result.geojson)
  }
}

export { checkBoundaryRoute }
