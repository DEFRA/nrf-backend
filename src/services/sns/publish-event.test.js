import { publishEvent } from './publish-event.js'
import { PublishCommand } from '@aws-sdk/client-sns'

vi.mock('@aws-sdk/client-sns')

describe('publishEvent', () => {
  const mockSend = vi.fn()
  const logger = { info: vi.fn(), error: vi.fn() }
  const mockClient = { send: mockSend }

  const mockTopicArn = 'arn:aws:sns:eu-west-2:123456789012:test-topic'
  const mockData = { foo: 'bar' }

  it('publishes a message successfully', async () => {
    mockSend.mockResolvedValueOnce({})

    await publishEvent(
      { topicArn: mockTopicArn, data: mockData },
      logger,
      mockClient
    )

    expect(PublishCommand).toHaveBeenCalledWith({
      TopicArn: mockTopicArn,
      Message: JSON.stringify(mockData)
    })
    expect(mockSend).toHaveBeenCalledWith(expect.any(PublishCommand))
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(`Published event to SNS topic: ${mockTopicArn}`)
    )
  })

  it('logs error and rethrows on failure', async () => {
    const error = { message: 'fail', name: 'InternalError', stack: 'stack' }
    mockSend.mockRejectedValueOnce(error)

    await expect(
      publishEvent(
        { topicArn: mockTopicArn, data: mockData },
        logger,
        mockClient
      )
    ).rejects.toMatchObject({ name: 'InternalError', message: 'fail' })

    expect(logger.error).toHaveBeenCalledWith(
      { error: 'fail', code: 'InternalError', stack: 'stack' },
      `Failed to publish event to SNS topic: ${mockTopicArn}`
    )
  })

  it('returns true on success', async () => {
    mockSend.mockResolvedValueOnce({})

    const result = await publishEvent(
      { topicArn: mockTopicArn, data: mockData },
      logger,
      mockClient
    )

    expect(result).toBe(true)
  })
})
