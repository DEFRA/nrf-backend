import { randomUUID } from 'node:crypto'

import { audit } from '@defra/cdp-auditing'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

const ORG_DEFRA_ID = '27d48d6c-6e94-f011-b4cc-000d3ac28f39'

const uniqueEmail = () =>
  `user-${Date.now()}-${Math.random().toString(36).slice(2)}@housebuilder.com`

const sendPatchRequest = ({ server, defraId, payload }) => {
  return server.inject({
    method: 'PATCH',
    url: `/users/${defraId}`,
    payload
  })
}

const validPayload = (email) => ({ email, firstName: 'Test', lastName: 'User' })

describe('PATCH /users/{defraId}', () => {
  const getServer = setupTestServer()

  it('returns 204 and saves a new user with their defra id', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    const response = await sendPatchRequest({
      server,
      defraId,
      payload: validPayload(email)
    })

    expect(response.statusCode).toBe(statusCodes.noContent)

    const { rows } = await server.pg.query(
      'SELECT email, first_name, last_name FROM users WHERE defra_id = $1',
      [defraId]
    )
    expect(rows).toEqual([{ email, first_name: 'Test', last_name: 'User' }])
  })

  it('audits the create-user event when a new user is created', async () => {
    const server = getServer()

    await sendPatchRequest({
      server,
      defraId: randomUUID(),
      payload: validPayload(uniqueEmail())
    })

    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        event: { category: 'user', action: 'create-user' },
        context: {
          user: expect.objectContaining({ id: expect.any(String) })
        }
      })
    )
  })

  it('does not audit again when the same user signs in a second time', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const payload = validPayload(uniqueEmail())

    await sendPatchRequest({ server, defraId, payload })
    await sendPatchRequest({ server, defraId, payload })

    expect(vi.mocked(audit)).toHaveBeenCalledTimes(1)
  })

  it('merges an email-only record created before sign-in instead of duplicating the user', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    await server.pg.query('INSERT INTO users (email) VALUES ($1)', [email])

    const response = await sendPatchRequest({
      server,
      defraId,
      payload: validPayload(email)
    })

    expect(response.statusCode).toBe(statusCodes.noContent)

    const { rows } = await server.pg.query(
      'SELECT defra_id, first_signed_in_at FROM users WHERE email = $1',
      [email]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].defra_id).toBe(defraId)
    expect(rows[0].first_signed_in_at).not.toBeNull()

    const { rows: duplicateRows } = await server.pg.query(
      'SELECT id FROM users WHERE defra_id = $1',
      [defraId]
    )
    expect(duplicateRows).toHaveLength(1)
  })

  it('saves the organisation and user/organisation link when an org is present', async () => {
    const server = getServer()
    const defraId = randomUUID()

    await sendPatchRequest({
      server,
      defraId,
      payload: {
        ...validPayload(uniqueEmail()),
        organisationDefraId: ORG_DEFRA_ID,
        organisationName: 'CDP Child Org 1',
        relationshipType: 'Employee'
      }
    })

    const { rows: orgRows } = await server.pg.query(
      'SELECT name FROM organisations WHERE defra_id = $1',
      [ORG_DEFRA_ID]
    )
    expect(orgRows).toEqual([{ name: 'CDP Child Org 1' }])

    const { rows: linkRows } = await server.pg.query(
      `SELECT uo.relationship_type FROM user_organisations uo
       JOIN users u ON u.id = uo.user_id
       WHERE u.defra_id = $1 AND uo.organisation_defra_id = $2`,
      [defraId, ORG_DEFRA_ID]
    )
    expect(linkRows).toEqual([{ relationship_type: 'Employee' }])
  })

  describe('Request validation', () => {
    it.each([
      ['missing email', (payload) => delete payload.email],
      [
        'invalid relationship type',
        (payload) => {
          payload.organisationDefraId = ORG_DEFRA_ID
          payload.organisationName = 'CDP Child Org 1'
          payload.relationshipType = 'Director'
        }
      ],
      [
        'organisation id without a name',
        (payload) => {
          payload.organisationDefraId = ORG_DEFRA_ID
        }
      ],
      [
        'relationship type without an organisation id',
        (payload) => {
          payload.relationshipType = 'Employee'
        }
      ]
    ])('returns 400 when %s', async (_name, mutate) => {
      const server = getServer()

      const response = await sendPatchRequest({
        server,
        defraId: randomUUID(),
        payload: mutate(structuredClone(validPayload(uniqueEmail())))
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })

    it('returns 400 when the defra id path param contains whitespace', async () => {
      const server = getServer()

      const response = await sendPatchRequest({
        server,
        defraId: 'abc%20def',
        payload: validPayload(uniqueEmail())
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })
  })
})
