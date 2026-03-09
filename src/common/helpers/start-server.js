import { config } from '../../config.js'

import { createServer } from '../../server.js'
import { checkCdpUploaderHealth } from './cdp-uploader-health.js'

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

export { startServer }
