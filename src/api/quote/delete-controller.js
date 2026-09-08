import { audit } from '@defra/cdp-auditing'
import Boom from '@hapi/boom'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbDeleteQuote } from '../../services/db/quotes/delete-quote.js'
import { canDeleteQuote } from './helpers/can-delete-quote.js'
import { auditEvents } from '../../common/constants/audit-events.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { config } from '../../config.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'

/**
 * @openapi
 * /quotes/{reference}:
 *   delete:
 *     tags:
 *       - Quote
 *     summary: Delete a quote by reference
 *     description: >
 *       Deletes the quote and its joined records (EDP results, access tokens,
 *       email notification records) via cascade. In production, only quotes
 *       created with an approved internal email address can be deleted;
 *       outside production any quote can be deleted.
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRL-\d{6}$
 *         example: NRL-000001
 *     responses:
 *       204:
 *         description: Quote deleted
 *       400:
 *         description: Reference format is invalid
 *       403:
 *         description: Quote is not eligible for deletion
 *       404:
 *         description: Quote not found
 */
export const deleteController = {
  options: {
    validate: {
      params: referenceParamSchema
    }
  },
  async handler(request, h) {
    const { reference } = request.params
    const quote = await dbGetQuote({ db: request.pg, reference })

    if (!quote) {
      throw Boom.notFound(`No quote found with reference ${reference}`)
    }

    const eligible = canDeleteQuote({
      email: quote.email?.address,
      patterns: config.get('quoteDelete.eligibleEmailPatterns'),
      isProd: config.get('cdpEnvironment') === 'prod'
    })

    if (!eligible) {
      throw Boom.forbidden('Quote is not eligible for deletion')
    }

    const deleted = await dbDeleteQuote({ db: request.pg, id: quote.id })

    if (!deleted) {
      // The quote vanished between the fetch and the delete
      throw Boom.notFound(`No quote found with reference ${reference}`)
    }

    if (!quote.disableAnalyticsAudit) {
      audit({
        event: {
          category: auditEvents.quote.category,
          action: auditEvents.quote.deleteQuote
        },
        context: { quote }
      })
    }

    return h.response().code(statusCodes.noContent)
  }
}
