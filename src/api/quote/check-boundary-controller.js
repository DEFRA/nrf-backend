import joi from 'joi'
import Boom from '@hapi/boom'
import { downloadBoundaryFile } from '../../services/s3/s3-client.js'
import { submitBoundaryCheck } from '../../services/impact-assessor/impact-assessor.js'

/**
 * @openapi
 * /quote/check-boundary/{id}:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Check a boundary file against the impact assessor
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       202:
 *         description: Boundary check submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 pollUrl:
 *                   type: string
 *       400:
 *         description: Validation error
 *       422:
 *         description: Boundary file not found
 */
export const checkBoundaryController = {
  options: {
    validate: {
      query: false,
      params: joi.object({
        id: joi.string().uuid().required()
      })
    }
  },
  handler: async (request, h) => {
    const { id } = request.params

    let file
    try {
      file = await downloadBoundaryFile(id)
    } catch (error) {
      request.logger.error(
        `Failed to download boundary file for ${id}: ${error.message}`
      )
      return Boom.badData(`No boundary file found for upload ${id}`)
    }

    request.logger.info(
      `Downloaded boundary file "${file.filename}" for upload ${id}`
    )

    const result = await submitBoundaryCheck(file.buffer, file.filename)

    return h
      .response({
        jobId: result.job_id,
        status: result.status,
        pollUrl: result.poll_url
      })
      .code(202)
  }
}
