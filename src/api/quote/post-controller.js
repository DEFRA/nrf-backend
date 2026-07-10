import { audit } from '@defra/cdp-auditing'
import { auditEvents } from '../../common/constants/audit-events.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { dbCreateQuote } from '../../services/db/quotes/create-quote.js'
import { quoteSchema } from './validation/post-schema.js'
import { publishQuoteMessage } from './helpers/publish-quote-message.js'
import { getTraceId } from '@defra/hapi-tracing'

/**
 * @openapi
 * /quotes:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Create a quote and send confirmation email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planningType
 *               - boundaryEntryType
 *               - developmentTypes
 *               - email
 *             properties:
 *               planningType:
 *                 type: string
 *                 enum:
 *                   - full-planning-permission
 *                   - outline-planning-permission
 *                   - hybrid-planning-permission
 *                   - other
 *               boundaryEntryType:
 *                 type: string
 *                 enum: [draw, upload]
 *               developmentTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [housing, other-residential]
 *               residentialBuildingCount:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 999999
 *                 description: Required when developmentTypes includes housing
 *               peopleCount:
 *                 type: integer
 *                 minimum: 1
 *                 description: Required when developmentTypes includes other-residential
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Quote created
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *             description: URL of the created quote
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reference:
 *                   type: string
 *                   example: NRF-000001
 *       400:
 *         description: Validation error
 */
export const postController = {
  options: {
    payload: {
      allow: 'application/json'
    },
    validate: {
      query: false,
      payload: quoteSchema
    }
  },
  async handler(request, h) {
    const { email } = request.payload
    const quote = await dbCreateQuote({
      db: request.pg,
      quoteData: request.payload
    })

    if (!request.payload.disableAnalyticsAudit) {
      if (quote.userCreated) {
        audit({
          event: {
            category: auditEvents.user.category,
            action: auditEvents.user.createUser
          },
          context: { user: { id: quote.userId, email } }
        })
      }

      audit({
        event: {
          category: auditEvents.quote.category,
          action: auditEvents.quote.createQuote,
          actor: { type: 'user', id: quote.userId }
        },
        context: { quote }
      })
    }

    const traceId = getTraceId()
    await publishQuoteMessage({
      quoteData: {
        ...request.payload,
        reference: quote.reference
      },
      logger: request.logger,
      traceId
    })
    return h
      .response({ reference: quote.reference })
      .header('Location', `/quotes/${quote.reference}`)
      .code(statusCodes.created)
  }
}
