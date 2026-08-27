import { randomUUID } from 'node:crypto'

import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

const ORG_DEFRA_ID = '27d48d6c-6e94-f011-b4cc-000d3ac28f39'

const uniqueEmail = () =>
  `user-${Date.now()}-${Math.random().toString(36).slice(2)}@housebuilder.com`

const sendPatchRequest = ({ server, payload }) => {
  return server.inject({
    method: 'PATCH',
    url: '/users',
    payload
  })
}

const validPayload = (defraId, email) => ({
  defraId,
  email,
  firstName: 'Test',
  lastName: 'User'
})

describe('PATCH /users', () => {
  const getServer = setupTestServer()

  it('returns 404 when no user row exists for this defra id', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    const response = await sendPatchRequest({
      server,
      payload: validPayload(defraId, email)
    })

    expect(response.statusCode).toBe(statusCodes.notFound)

    const { rows } = await server.pg.query(
      'SELECT id FROM users WHERE defra_id = $1 OR email = $2',
      [defraId, email]
    )
    expect(rows).toHaveLength(0)
  })

  it('merges an email-only record created before sign-in instead of duplicating the user', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    await server.pg.query('INSERT INTO users (email) VALUES ($1)', [email])

    const response = await sendPatchRequest({
      server,
      payload: validPayload(defraId, email)
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

  it('returns 404 and leaves the row untouched when the email belongs to a user already signed in under a different defra id', async () => {
    const server = getServer()
    const existingDefraId = randomUUID()
    const incomingDefraId = randomUUID()
    const email = uniqueEmail()

    await server.pg.query(
      'INSERT INTO users (email, defra_id) VALUES ($1, $2)',
      [email, existingDefraId]
    )

    const response = await sendPatchRequest({
      server,
      payload: validPayload(incomingDefraId, email)
    })

    expect(response.statusCode).toBe(statusCodes.notFound)

    const { rows } = await server.pg.query(
      'SELECT defra_id FROM users WHERE email = $1',
      [email]
    )
    expect(rows).toEqual([{ defra_id: existingDefraId }])

    const { rows: incomingRows } = await server.pg.query(
      'SELECT id FROM users WHERE defra_id = $1',
      [incomingDefraId]
    )
    expect(incomingRows).toHaveLength(0)
  })

  it('saves the organisation and user/organisation link when an org is present', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    await server.pg.query('INSERT INTO users (email) VALUES ($1)', [email])

    await sendPatchRequest({
      server,
      payload: {
        ...validPayload(defraId, email),
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

  it('does not save an organisation or link when the relationship type is Citizen', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    await server.pg.query('INSERT INTO users (email) VALUES ($1)', [email])

    await sendPatchRequest({
      server,
      payload: {
        ...validPayload(defraId, email),
        organisationDefraId: ORG_DEFRA_ID,
        organisationName: 'CDP Child Org 1',
        relationshipType: 'Citizen'
      }
    })

    const { rows: linkRows } = await server.pg.query(
      `SELECT uo.relationship_type FROM user_organisations uo
       JOIN users u ON u.id = uo.user_id
       WHERE u.defra_id = $1 AND uo.organisation_defra_id = $2`,
      [defraId, ORG_DEFRA_ID]
    )
    expect(linkRows).toHaveLength(0)
  })

  describe('Request validation', () => {
    it.each([
      ['missing defra id', (payload) => delete payload.defraId],
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
        payload: mutate(
          structuredClone(validPayload(randomUUID(), uniqueEmail()))
        )
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })

    it('returns 400 when the defra id contains whitespace', async () => {
      const server = getServer()

      const response = await sendPatchRequest({
        server,
        payload: validPayload('abc def', uniqueEmail())
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })
  })
})
