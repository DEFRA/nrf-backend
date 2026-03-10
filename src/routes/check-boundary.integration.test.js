import crypto from 'node:crypto'
import { setupTestServer } from '../test-utils/setup-test-server.js'

describe('Check boundary routes (integration)', () => {
  const getServer = setupTestServer()

  describe('POST /quote/check-boundary/{id}', () => {
    it('should return 422 when the boundary file does not exist', async () => {
      const nonExistentId = crypto.randomUUID()

      const response = await getServer().inject({
        method: 'POST',
        url: `/quote/check-boundary/${nonExistentId}`
      })

      expect(response.statusCode).toBe(422)
      const body = JSON.parse(response.payload)
      expect(body.message).toContain('No boundary file found')
    })
  })
})
