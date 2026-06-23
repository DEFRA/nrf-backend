import { describe, it, expect, vi } from 'vitest'
import { publishQuoteMessage } from './publish-quote-message.js'
import { publishEvent } from '../../../services/sns/publish-event.js'

vi.mock('../../../services/sns/publish-event.js')

const logger = { info: vi.fn(), error: vi.fn() }
const quoteData = {
  reference: 'NRF-123456',
  boundaryGeojson: { type: 'Polygon', coordinates: [] },
  developmentTypes: ['housing'],
  residentialBuildingCount: 10,
  peopleCount: 5
}

describe('publishQuoteMessage', () => {
  it('publishes an event with the quote data and trace id', () => {
    publishQuoteMessage({ quoteData, logger, traceId: 'trace-abc-123' })

    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        topicArn: expect.any(String),
        data: expect.objectContaining({
          reference: quoteData.reference,
          traceId: 'trace-abc-123'
        })
      }),
      logger
    )
  })

  it('publishes an event without traceId when not provided', () => {
    publishQuoteMessage({ quoteData, logger })

    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        topicArn: expect.any(String),
        data: expect.objectContaining({
          reference: quoteData.reference,
          traceId: undefined
        })
      }),
      logger
    )
  })
})
