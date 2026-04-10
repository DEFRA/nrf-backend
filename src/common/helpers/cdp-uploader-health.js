import { getCdpUploaderUrl } from '../../services/cdp-uploader/cdp-uploader.js'

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
    logger.error(error, `CDP Uploader health check error - url: ${url}`)
  }
}

export { checkCdpUploaderHealth }
