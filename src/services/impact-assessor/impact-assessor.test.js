import { submitBoundaryCheck } from './impact-assessor.js'

describe('submitBoundaryCheck', () => {
  it('should POST the file to the impact assessor and return the response', async () => {
    const mockResponse = {
      job_id: 'job-123',
      status: 'pending',
      poll_url: '/assess/job-123'
    }

    global.fetchMock.mockResponseOnce(JSON.stringify(mockResponse), {
      status: 202
    })

    const result = await submitBoundaryCheck(
      Buffer.from('test content'),
      'boundary.geojson'
    )

    expect(result).toEqual(mockResponse)
    expect(global.fetchMock).toHaveBeenCalledTimes(1)

    const [url, options] = global.fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8085/assess')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
  })

  it('should throw when the impact assessor returns a non-ok status', async () => {
    global.fetchMock.mockResponseOnce('Internal Server Error', { status: 500 })

    await expect(
      submitBoundaryCheck(Buffer.from('test'), 'file.geojson')
    ).rejects.toThrow('Impact assessor request failed with status 500')
  })
})
