import joi from 'joi'
import { BOUNDARY_ERRORS } from '@defra/nrf-library'

import { getUploadDetails } from '../services/cdp-uploader/cdp-uploader.js'
import { downloadFromS3 } from '../services/s3/s3-client.js'
import { validateZipSafety } from '../services/zip-safety/zip-safety.js'
import { validateShapefileZipContents } from '../services/zip-safety/shapefile-contents.js'
import { validateSafeFilename } from '../common/helpers/safe-filename.js'
import {
  checkBoundary,
  checkBoundaryGeometry
} from '../services/impact-assessor/impact-assessor.js'
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
        .response({ error: BOUNDARY_ERRORS.UPLOAD.UPLOAD_NOT_READY })
        .code(statusCodes.badRequest)
    }
  }

  const uploadedFile = uploadDetails.form?.file
  if (uploadDetails.numberOfRejectedFiles > 0) {
    // CDP Uploader's own rejection message is third-party text we don't
    // control, so this pattern match (not a display string) is the only way
    // to tell a size rejection apart from other rejections (virus scan,
    // mime-type mismatch, etc).
    const rejectionMessage =
      uploadedFile?.errorMessage ?? 'file rejected by uploader'
    logger.error(
      { uploadId, error: rejectionMessage },
      'File rejected by uploader'
    )
    const isTooLarge = /smaller than|too large|size/i.test(rejectionMessage)
    const statusCode = isTooLarge
      ? statusCodes.payloadTooLarge
      : statusCodes.badRequest
    const code = isTooLarge
      ? BOUNDARY_ERRORS.UPLOAD.FILE_SIZE_TOO_LARGE
      : BOUNDARY_ERRORS.UPLOAD.FILE_REJECTED_BY_UPLOADER
    return {
      error: h.response({ error: code }).code(statusCode)
    }
  }

  if (!uploadedFile?.s3Key) {
    logger.error(
      `No file info in upload details - uploadId: ${uploadId}, form: ${JSON.stringify(uploadDetails.form)}`
    )
    return {
      error: h
        .response({ error: BOUNDARY_ERRORS.UPLOAD.UPLOAD_FILE_MISSING })
        .code(statusCodes.notFound)
    }
  }

  return { fileInfo: uploadedFile }
}

function isZipUpload(filename, contentType) {
  return /\.zip$/i.test(filename ?? '') || contentType === 'application/zip'
}

async function validateZipUpload(buffer, { uploadId, filename }) {
  const safety = await validateZipSafety(buffer)
  if (!safety.ok) {
    logger.warn(
      `Zip safety check rejected upload - uploadId: ${uploadId}, code: ${safety.code}, filename: ${filename}`
    )
    return safety
  }

  const contents = await validateShapefileZipContents(buffer)
  if (!contents.ok) {
    logger.warn(
      `Zip contents check rejected upload - uploadId: ${uploadId}, code: ${contents.code}, filename: ${filename}`
    )
    return contents
  }

  return { ok: true, shapefileName: contents.shapefileName }
}

async function resolveBoundaryFilename(
  { filename, contentType, fileData, uploadId },
  h
) {
  // For standalone uploads (.geojson/.kml/.json) the filename is whatever
  // the client sent through the CDP uploader and is fully user-controlled.
  // Validate it at this trust boundary so every downstream consumer (logs,
  // DB, JSON response, HTML templates) can trust the value implicitly.
  if (!isZipUpload(filename, contentType)) {
    const safe = validateSafeFilename(filename)
    if (!safe.ok) {
      logger.warn(
        `Upload filename rejected by safe-filename check - uploadId: ${uploadId}, code: ${safe.code}`
      )
      return {
        error: h.response({ error: safe.code }).code(statusCodes.badRequest)
      }
    }
    return { isZip: false, boundaryFilename: safe.filename }
  }

  // For zip uploads we also need the outer filename (the .zip) to be safe,
  // because we log it with the uploadId for diagnostics. The inner .shp
  // filename that ends up persisted is validated inside
  // validateShapefileZipContents.
  const outerSafe = validateSafeFilename(filename)
  if (!outerSafe.ok) {
    logger.warn(
      `Upload filename rejected by safe-filename check - uploadId: ${uploadId}, code: ${outerSafe.code}`
    )
    return {
      error: h.response({ error: outerSafe.code }).code(statusCodes.badRequest)
    }
  }

  const zipCheck = await validateZipUpload(fileData.body, {
    uploadId,
    filename: outerSafe.filename
  })
  if (!zipCheck.ok) {
    return {
      error: h.response({ error: zipCheck.code }).code(statusCodes.badRequest)
    }
  }

  return { isZip: true, boundaryFilename: zipCheck.shapefileName }
}

function buildBoundaryResponse(result, boundaryFilename, h) {
  if (result.error) {
    const statusCode = result.statusCode ?? statusCodes.badGateway
    const response = { error: result.error }
    if (result.boundaryGeometryOriginal) {
      response.boundaryGeometryOriginal = result.boundaryGeometryOriginal
    }
    if (result.boundaryGeometryWgs84) {
      response.boundaryGeometryWgs84 = result.boundaryGeometryWgs84
    }
    return h.response(response).code(statusCode)
  }

  return h.response({ ...result.geojson, boundaryFilename })
}

async function downloadFile(fileInfo, h) {
  const bucket = fileInfo.s3Bucket ?? config.get('cdpUploader.bucket')

  try {
    const fileData = await downloadFromS3(bucket, fileInfo.s3Key)
    return { fileData }
  } catch (error) {
    logger.error(
      error,
      `Failed to download file from S3 - bucket: ${bucket}, key: ${fileInfo.s3Key}`
    )
    return {
      error: h
        .response({ error: BOUNDARY_ERRORS.UPLOAD.S3_DOWNLOAD_FAILED })
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
 *       Downloads the uploaded file from S3 and sends it to the impact assessor for
 *       geometry validation. Returns the extracted GeoJSON on success.
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
 *         description: Boundary check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 boundaryGeometryOriginal:
 *                   type: object
 *                   description: The boundary geometry in its original CRS, as GeoJSON
 *                 boundaryGeometryWgs84:
 *                   type: object
 *                   description: The boundary geometry reprojected to WGS84, as GeoJSON
 *                 intersectingEdps:
 *                   type: array
 *                   description: EDPs that intersect the boundary
 *                   items:
 *                     type: object
 *                 boundaryFilename:
 *                   type: string
 *                   description: >
 *                     The filename to display and persist for this boundary.
 *                     For a zip upload, this is the .shp filename inside the
 *                     zip; for a standalone upload, it is the uploaded filename.
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

    // The boundary filename we show to the user and persist with the quote.
    // For a zip upload, this is the inner .shp filename (resolved after
    // validation); for a standalone .geojson/.kml/.json it's the upload name.
    // When the upload is a zip, we also pass this through to the impact
    // assessor so it opens that exact entry inside the extracted archive
    // rather than re-implementing a picking rule of its own.
    const resolved = await resolveBoundaryFilename(
      { filename, contentType, fileData, uploadId },
      h
    )
    if (resolved.error) {
      return resolved.error
    }
    const { isZip, boundaryFilename } = resolved

    const result = await checkBoundary(fileData.body, filename, contentType, {
      // Only meaningful inside a zip — for standalone uploads the impact
      // assessor reads the whole request body directly.
      boundaryFilename: isZip ? boundaryFilename : null
    })

    return buildBoundaryResponse(result, boundaryFilename, h)
  }
}

const GEOJSON_GEOMETRY_TYPES = [
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection'
]

const geometrySchema = joi
  .object({
    type: joi
      .string()
      .valid(...GEOJSON_GEOMETRY_TYPES, 'Feature', 'FeatureCollection')
      .required(),
    coordinates: joi.array().when('type', {
      is: joi.valid(...GEOJSON_GEOMETRY_TYPES),
      then: joi.required()
    }),
    geometry: joi.object().when('type', {
      is: 'Feature',
      then: joi.required()
    }),
    features: joi.array().when('type', {
      is: 'FeatureCollection',
      then: joi.required()
    })
  })
  .unknown(true)

/**
 * @openapi
 * /boundary/check:
 *   post:
 *     tags:
 *       - Boundary
 *     summary: Check a boundary geometry supplied as GeoJSON
 *     description: >
 *       Accepts a GeoJSON Geometry, Feature, or FeatureCollection in the request body
 *       and forwards it to the impact assessor's /check-boundary endpoint as an
 *       in-memory file. Returns the same response shape as the upload-id variant.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [geometry]
 *             properties:
 *               geometry:
 *                 type: object
 *                 description: GeoJSON Geometry, Feature, or FeatureCollection
 *     responses:
 *       200:
 *         description: Boundary check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 boundaryGeometryOriginal:
 *                   type: object
 *                   description: The boundary geometry in its original CRS, as GeoJSON
 *                 boundaryGeometryWgs84:
 *                   type: object
 *                   description: The boundary geometry reprojected to WGS84, as GeoJSON
 *                 intersectingEdps:
 *                   type: array
 *                   description: EDPs that intersect the boundary
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid or unreadable geometry
 *       413:
 *         description: Payload too large
 *       502:
 *         description: Impact assessor service error
 */
const checkBoundaryGeometryRoute = {
  method: 'POST',
  path: '/boundary/check',
  options: {
    payload: {
      maxBytes: 10 * 1024 * 1024
    },
    validate: {
      payload: joi.object({
        geometry: geometrySchema.required()
      })
    }
  },
  handler: async (request, h) => {
    const { geometry } = request.payload

    const result = await checkBoundaryGeometry(geometry)

    if (result.error) {
      const statusCode = result.statusCode ?? statusCodes.badGateway
      const response = { error: result.error }
      if (result.boundaryGeometryOriginal) {
        response.boundaryGeometryOriginal = result.boundaryGeometryOriginal
      }
      if (result.boundaryGeometryWgs84) {
        response.boundaryGeometryWgs84 = result.boundaryGeometryWgs84
      }
      return h.response(response).code(statusCode)
    }

    return h.response(result.geojson)
  }
}

export { checkBoundaryRoute, checkBoundaryGeometryRoute }
