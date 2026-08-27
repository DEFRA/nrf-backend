import { randomUUID } from 'node:crypto'

import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'

const ORG_DEFRA_ID = '27d48d6c-6e94-f011-b4cc-000d3ac28f39'

const uniqueEmail = () =>
  `user-${Date.now()}-${Math.random().toString(36).slice(2)}@housebuilder.com`

const validPayload = (email) => ({ email, firstName: 'Test', lastName: 'User' })

// PATCH /users only updates an existing row (the email-only record created
// before sign-in), so seed that row first.
const seedUser = async ({ server, email }) => {
  await server.pg.query('INSERT INTO users (email) VALUES ($1)', [email])
}

const sendPatchRequest = async ({ server, defraId, payload }) =>
  server.inject({
    method: 'PATCH',
    url: '/users',
    payload: { defraId, ...payload }
  })

const sendGetRequest = ({ server, defraId }) =>
  server.inject({ method: 'GET', url: `/users/${defraId}` })

describe('GET /users/{defraId}', () => {
  const getServer = setupTestServer()

  it('returns the user details and their linked organisations', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    await seedUser({ server, email })
    await sendPatchRequest({
      server,
      defraId,
      payload: {
        ...validPayload(email),
        organisationDefraId: ORG_DEFRA_ID,
        organisationName: 'CDP Child Org 1',
        relationshipType: 'Employee'
      }
    })

    const response = await sendGetRequest({ server, defraId })

    expect(response.statusCode).toBe(statusCodes.ok)
    const body = JSON.parse(response.payload)
    expect(body).toEqual({
      id: expect.any(String),
      defraId,
      email,
      firstName: 'Test',
      lastName: 'User',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      firstSignedInAt: expect.any(String),
      organisations: [
        {
          defraId: ORG_DEFRA_ID,
          name: 'CDP Child Org 1',
          relationshipType: 'Employee'
        }
      ]
    })
  })

  it('returns an empty organisations array when the user has no organisation link', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    await seedUser({ server, email })
    await sendPatchRequest({
      server,
      defraId,
      payload: validPayload(email)
    })

    const response = await sendGetRequest({ server, defraId })

    expect(response.statusCode).toBe(statusCodes.ok)
    const body = JSON.parse(response.payload)
    expect(body.organisations).toEqual([])
  })

  it('returns every organisation the user is linked to', async () => {
    const server = getServer()
    // Random ids: the test database is not reset between runs, so fixed org
    // ids would collide with rows left behind by a previous run.
    const defraId = randomUUID()
    const secondOrgId = randomUUID()
    const thirdOrgId = randomUUID()
    const email = uniqueEmail()

    await seedUser({ server, email })
    await sendPatchRequest({
      server,
      defraId,
      payload: {
        ...validPayload(email),
        organisationDefraId: ORG_DEFRA_ID,
        organisationName: 'CDP Child Org 1',
        relationshipType: 'Employee'
      }
    })

    const {
      rows: [userRow]
    } = await server.pg.query('SELECT id FROM users WHERE defra_id = $1', [
      defraId
    ])

    await server.pg.query(
      'INSERT INTO organisations (defra_id, name) VALUES ($1, $2), ($3, $4)',
      [secondOrgId, 'CDP Child Org 2', thirdOrgId, 'CDP Child Org 3']
    )

    await server.pg.query(
      `INSERT INTO user_organisations (user_id, organisation_defra_id, relationship_type)
       VALUES ($1, $2, 'Employee'), ($3, $4, 'Agent')`,
      [userRow.id, secondOrgId, userRow.id, thirdOrgId]
    )

    const response = await sendGetRequest({ server, defraId })

    expect(response.statusCode).toBe(statusCodes.ok)
    const body = JSON.parse(response.payload)
    // The endpoint orders organisations by defra id, so sort the expectation to match.
    const expectedOrganisations = [
      {
        defraId: secondOrgId,
        name: 'CDP Child Org 2',
        relationshipType: 'Employee'
      },
      {
        defraId: ORG_DEFRA_ID,
        name: 'CDP Child Org 1',
        relationshipType: 'Employee'
      },
      {
        defraId: thirdOrgId,
        name: 'CDP Child Org 3',
        relationshipType: 'Agent'
      }
    ].sort((a, b) => a.defraId.localeCompare(b.defraId))

    expect(body.organisations).toEqual(expectedOrganisations)
  })

  it('returns null first and last names when they are not set', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    await seedUser({ server, email })
    await sendPatchRequest({
      server,
      defraId,
      payload: validPayload(email)
    })

    await server.pg.query(
      'UPDATE users SET first_name = NULL, last_name = NULL WHERE defra_id = $1',
      [defraId]
    )

    const response = await sendGetRequest({ server, defraId })

    expect(response.statusCode).toBe(statusCodes.ok)
    const body = JSON.parse(response.payload)
    expect(body.firstName).toBeNull()
    expect(body.lastName).toBeNull()
  })

  it('returns 404 when no user has the defra id', async () => {
    const server = getServer()

    const response = await sendGetRequest({ server, defraId: randomUUID() })

    expect(response.statusCode).toBe(statusCodes.notFound)
  })

  it('returns 400 when the defra id path param contains whitespace', async () => {
    const server = getServer()

    const response = await sendGetRequest({ server, defraId: 'abc%20def' })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
