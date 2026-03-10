import { Blob } from 'node:buffer'
import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

export async function submitBoundaryCheck(fileBuffer, filename) {
  const baseUrl = config.get('impactAssessor.url')
  const url = `${baseUrl}/assess`

  const formData = new FormData()
  formData.append('geometry_file', new Blob([fileBuffer]), filename)

  logger.info(`Submitting boundary check to ${url} for file: ${filename}`)

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`Impact assessor returned ${response.status}: ${errorText}`)
    throw new Error(
      `Impact assessor request failed with status ${response.status}`
    )
  }

  return response.json()
}
