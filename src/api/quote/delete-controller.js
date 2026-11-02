import Boom from '@hapi/boom'
import { audit } from '@defra/cdp-auditing'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbDeleteQuote } from '../../services/db/quotes/delete-quote.js'
import { auditEvents } from '../../common/constants/audit-events.js'
import { statusCodes } from '../../common/constants/status-codes.js'
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
 *       email notification records) via cascade. An audit event records the
 *       deletion with the quote reference only.
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

    const deleted = await dbDeleteQuote({ db: request.pg, id: quote.id })

    if (!deleted) {
      // The quote vanished between the fetch and the delete
      throw Boom.notFound(`No quote found with reference ${reference}`)
    }

    // The deleted quote's personal data must not survive in the audit trail,
    // so the event carries the reference only — never the full quote record
    audit({
      event: {
        category: auditEvents.quote.category,
        action: auditEvents.quote.deleteQuote,
        actor: { type: 'user', id: quote.userId }
      },
      context: { quote: { reference } }
    })

    return h.response().code(statusCodes.noContent)
  }
}
