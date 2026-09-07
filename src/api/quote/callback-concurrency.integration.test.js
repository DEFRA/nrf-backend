import { randomUUID } from 'node:crypto'

import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import { boundaryGeojson } from '../../test-utils/fixtures/boundaryGeojson.js'
import {
  validEdpsPayload,
  twoEdpPayload,
  PLACEHOLDER_EDP_NAME
} from '../../test-utils/fixtures/quotePayloads.js'
import {
  createQuote,
  sendPatchRequest,
  getQuoteId,
  getAccessTokenRowsForReference,
  getEmailNotificationRowsForReference,
  getEdpResultRowsForReference
} from '../../test-utils/quote-request-helpers.js'

vi.mock('@defra/cdp-auditing')
vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

// Long enough that an unlocked request finishes inside it — verified by
// removing the lock and watching this test fail.
const LOCK_WAIT_MS = 300

describe('Assessor callback concurrency', () => {
  const getServer = setupTestServer()

  beforeEach(() => {
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: vi
        .fn()
        .mockImplementation(async () => ({ data: { id: randomUUID() } }))
    })
  })

  const newQuote = async () => {
    const response = await createQuote(getServer())
    return JSON.parse(response.payload).reference
  }

  const tokenRows = (reference) =>
    getAccessTokenRowsForReference({ server: getServer(), reference })

  const emailRows = (reference) =>
    getEmailNotificationRowsForReference({ server: getServer(), reference })

  // The quote is resolved first so the blocked request has no writes of its
  // own. An unresolved callback inserts child rows whose foreign-key check
  // takes a KEY SHARE lock that FOR UPDATE already conflicts with, so it
  // would block with or without dbLockQuote and prove nothing.
  it('blocks a repeat callback while the quote row is locked', async () => {
    const reference = await newQuote()
    const quoteId = await getQuoteId({ server: getServer(), reference })

    const first = await sendPatchRequest({
      server: getServer(),
      reference,
      payload: twoEdpPayload
    })
    expect(first.statusCode).toBe(statusCodes.ok)

    const holder = await getServer().pg.connect()
    let patchDone = false
    let committed = false
    let patch

    try {
      await holder.query('BEGIN')
      await holder.query('SELECT id FROM quotes WHERE id = $1 FOR UPDATE', [
        quoteId
      ])

      // Identical payload: nothing to write, so the only thing that can hold
      // this request up is dbLockQuote.
      patch = sendPatchRequest({
        server: getServer(),
        reference,
        payload: twoEdpPayload
      }).then((response) => {
        patchDone = true
        return response
      })

      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS))
      expect(patchDone).toBe(false)

      await holder.query('COMMIT')
      committed = true

      const response = await patch
      expect(response.statusCode).toBe(statusCodes.ok)
    } finally {
      // If the assertion above threw, the transaction is still open and the
      // PATCH is still blocked on it. Roll back first so the request can
      // finish, then wait for it: releasing a client with an open transaction
      // returns a poisoned connection to the pool, and abandoning the request
      // leaves it writing rows into the next test.
      if (!committed) {
        await holder.query('ROLLBACK').catch(() => {})
      }
      await patch?.catch(() => {})
      holder.release()
    }

    expect(await tokenRows(reference)).toHaveLength(1)
    expect(await emailRows(reference)).toHaveLength(1)
  })

  it('admits one winner when two callbacks arrive together', async () => {
    const reference = await newQuote()

    const responses = await Promise.all([
      sendPatchRequest({
        server: getServer(),
        reference,
        payload: twoEdpPayload
      }),
      sendPatchRequest({
        server: getServer(),
        reference,
        payload: twoEdpPayload
      })
    ])

    expect(responses.map((response) => response.statusCode)).toEqual([
      statusCodes.ok,
      statusCodes.ok
    ])
    expect(await tokenRows(reference)).toHaveLength(1)
    expect(await emailRows(reference)).toHaveLength(1)

    // Every EDP on exactly one row: the placeholder filled, not duplicated.
    const rows = await getEdpResultRowsForReference({
      server: getServer(),
      reference
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.edp_id).sort()).toEqual([111, 222])

    const filled = rows.find((row) => row.edp_id === 111)
    expect(filled.edp_name).toBe(PLACEHOLDER_EDP_NAME)
    expect(filled.catchments).toEqual(
      boundaryGeojson.intersectingEdps[0].catchments
    )
  })

  it('admits one winner for a quote created without placeholders', async () => {
    const reference = await newQuote()
    await getServer().pg.query(
      `DELETE FROM quote_edp_results
        WHERE quote_id = (SELECT id FROM quotes WHERE reference = $1)`,
      [reference]
    )

    const responses = await Promise.all([
      sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      }),
      sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })
    ])

    expect(responses.map((response) => response.statusCode)).toEqual([
      statusCodes.ok,
      statusCodes.ok
    ])
    expect(await tokenRows(reference)).toHaveLength(1)
  })
})
