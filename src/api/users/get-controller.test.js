import { randomUUID } from 'node:crypto'

import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  ORG_DEFRA_ID,
  uniqueEmail,
  validPayload,
  seedUser,
  sendPatchRequest,
  sendGetRequest
} from '../../test-utils/user-request-helpers.js'

const ORG_1_NAME = 'CDP Child Org 1'
const ORG_2_NAME = 'CDP Child Org 2'
const ORG_3_NAME = 'CDP Child Org 3'
const RELATIONSHIP_EMPLOYEE = 'Employee'
const RELATIONSHIP_AGENT = 'Agent'

describe('GET /users', () => {
  const getServer = setupTestServer()

  it('returns the user details and their linked organisations', async () => {
    const server = getServer()
    const defraId = randomUUID()
    const email = uniqueEmail()

    await seedUser({ server, email })
    await sendPatchRequest({
      server,
      payload: {
        ...validPayload(defraId, email),
        organisationDefraId: ORG_DEFRA_ID,
        organisationName: ORG_1_NAME,
        relationshipType: RELATIONSHIP_EMPLOYEE
      }
    })

    const response = await sendGetRequest({ server, defraId })

    expect(response.statusCode).toBe(statusCodes.ok)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers.vary).toBe('x-defra-id')
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
          name: ORG_1_NAME,
          relationshipType: RELATIONSHIP_EMPLOYEE
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
      payload: validPayload(defraId, email)
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
      payload: {
        ...validPayload(defraId, email),
        organisationDefraId: ORG_DEFRA_ID,
        organisationName: ORG_1_NAME,
        relationshipType: RELATIONSHIP_EMPLOYEE
      }
    })

    const {
      rows: [userRow]
    } = await server.pg.query('SELECT id FROM users WHERE defra_id = $1', [
      defraId
    ])

    await server.pg.query(
      'INSERT INTO organisations (defra_id, name) VALUES ($1, $2), ($3, $4)',
      [secondOrgId, ORG_2_NAME, thirdOrgId, ORG_3_NAME]
    )

    await server.pg.query(
      `INSERT INTO user_organisations (user_id, organisation_defra_id, relationship_type)
       VALUES ($1, $2, $5), ($3, $4, $6)`,
      [
        userRow.id,
        secondOrgId,
        userRow.id,
        thirdOrgId,
        RELATIONSHIP_EMPLOYEE,
        RELATIONSHIP_AGENT
      ]
    )

    const response = await sendGetRequest({ server, defraId })

    expect(response.statusCode).toBe(statusCodes.ok)
    const body = JSON.parse(response.payload)
    // The endpoint orders organisations by defra id, so sort the expectation to match.
    const expectedOrganisations = [
      {
        defraId: secondOrgId,
        name: ORG_2_NAME,
        relationshipType: RELATIONSHIP_EMPLOYEE
      },
      {
        defraId: ORG_DEFRA_ID,
        name: ORG_1_NAME,
        relationshipType: RELATIONSHIP_EMPLOYEE
      },
      {
        defraId: thirdOrgId,
        name: ORG_3_NAME,
        relationshipType: RELATIONSHIP_AGENT
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
      payload: validPayload(defraId, email)
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

  it('returns 400 when the defra id header contains whitespace', async () => {
    const server = getServer()

    const response = await sendGetRequest({ server, defraId: 'abc def' })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })
})
