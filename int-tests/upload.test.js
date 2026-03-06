import { describe, it, expect } from 'vitest'

const BASE_URL = process.env.INT_TEST_BASE_URL || 'http://localhost:3001'

describe('/upload/initiate', () => {
  it('POST returns uploadId and uploadUrl', async () => {
    const response = await fetch(`${BASE_URL}/upload/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect: 'http://localhost:3000/upload-complete',
        s3Bucket: 'boundaries',
        s3Path: 'test-uploads',
        metadata: { source: 'int-test' }
      })
    })

    expect(response.ok).toBe(true)

    const body = await response.json()
    expect(body.uploadId).toBeDefined()
    expect(body.uploadUrl).toBeDefined()
  })
})

describe('/upload/{uploadId}/status', () => {
  it('GET returns uploadStatus for a valid upload', async () => {
    // First initiate an upload to get an ID
    const initiateRes = await fetch(`${BASE_URL}/upload/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect: 'http://localhost:3000/upload-complete',
        s3Bucket: 'boundaries',
        s3Path: 'test-uploads'
      })
    })

    expect(initiateRes.ok).toBe(true)
    const { uploadId } = await initiateRes.json()

    // Check its status
    const statusRes = await fetch(`${BASE_URL}/upload/${uploadId}/status`)
    expect(statusRes.ok).toBe(true)

    const body = await statusRes.json()
    expect(['initiated', 'pending', 'ready']).toContain(body.uploadStatus)
  })
})
