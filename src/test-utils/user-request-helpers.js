import { randomUUID } from 'node:crypto'

export const ORG_DEFRA_ID = '27d48d6c-6e94-f011-b4cc-000d3ac28f39'

export const uniqueEmail = () => `user-${randomUUID()}@housebuilder.com`

export const validPayload = (defraId, email) => ({
  defraId,
  email,
  firstName: 'Test',
  lastName: 'User'
})

// PATCH /users only updates an existing row (the email-only record created
// before sign-in), so seed that row first.
export const seedUser = async ({ server, email }) => {
  await server.pg.query('INSERT INTO users (email) VALUES ($1)', [email])
}

export const sendPatchRequest = ({ server, payload }) =>
  server.inject({
    method: 'PATCH',
    url: '/users',
    payload
  })

export const sendGetRequest = ({ server, defraId }) =>
  server.inject({
    method: 'GET',
    url: '/users',
    headers: { 'x-defra-id': defraId }
  })
