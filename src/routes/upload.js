import joi from 'joi'
import { MAX_BOUNDARY_FILE_SIZE_MB } from '@defra/nrf-library'

import {
  initiateUpload as initiateUploadService,
  getUploadStatus
} from '../services/cdp-uploader/cdp-uploader.js'

/**
 * @openapi
 * /upload/initiate:
 *   post:
 *     tags:
 *       - Upload
 *     summary: Initiate a file upload
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - redirect
 *               - s3Bucket
 *             properties:
 *               redirect:
 *                 type: string
 *               s3Bucket:
 *                 type: string
 *               s3Path:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Upload initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Validation error
 */
const initiateUpload = {
  method: 'POST',
  path: '/upload/initiate',
  options: {
    validate: {
      payload: joi.object({
        redirect: joi.string().uri({ relativeOnly: true }).required(),
        s3Bucket: joi.string().required(),
        s3Path: joi.string().optional(),
        metadata: joi.object().optional()
      })
    }
  },
  handler: async (request, h) => {
    const maxFileSize = MAX_BOUNDARY_FILE_SIZE_MB * 1024 * 1024
    const result = await initiateUploadService({
      ...request.payload,
      maxFileSize
    })
    return h.response(result)
  }
}

/**
 * @openapi
 * /upload/{uploadId}/status:
 *   get:
 *     tags:
 *       - Upload
 *     summary: Get the status of an upload
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Upload status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Validation error
 */
const uploadStatus = {
  method: 'GET',
  path: '/upload/{uploadId}/status',
  options: {
    validate: {
      params: joi.object({
        uploadId: joi.string().uuid().required()
      })
    }
  },
  handler: async (request, h) => {
    const result = await getUploadStatus(request.params.uploadId)
    return h.response(result)
  }
}

export { initiateUpload, uploadStatus }
