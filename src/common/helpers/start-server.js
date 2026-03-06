import { config } from '../../config.js'

import { createServer } from '../../server.js'
import { getCdpUploaderUrl } from '../../services/cdp-uploader/cdp-uploader.js'

async function startServer() {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your backend on http://localhost:${config.get('port')}`
  )

  await checkCdpUploaderHealth(server.logger)

  return server
}

async function checkCdpUploaderHealth(logger) {
  const baseUrl = getCdpUploaderUrl()
  const url = `${baseUrl}/health`

  try {
    const response = await fetch(url)
    if (response.ok) {
      logger.info(`CDP Uploader health check passed - url: ${url}`)
    } else {
      logger.error(
        `CDP Uploader health check failed - url: ${url}, status: ${response.status}`
      )
    }
  } catch (error) {
    logger.error(
      `CDP Uploader health check error - url: ${url}, message: ${error.message}`
    )
  }
}

export { startServer }
