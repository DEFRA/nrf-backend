import { dbUpdateUser } from './update-user.js'

const DEFRA_ID = '81d48d6c-6e94-f011-b4cc-000d3ac28f39'
const EMAIL = 'developer@housebuilder.com'

describe('dbUpdateUser', () => {
  const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

  const mockDb = () => ({
    query: vi.fn().mockResolvedValue({ rows: [{ id: mockUserId }] })
  })

  const baseArgs = {
    defraId: DEFRA_ID,
    email: EMAIL,
    firstName: 'Test',
    lastName: 'User'
  }

  it('should merge an email-only record and update the user by defra id', async () => {
    const db = mockDb()

    await dbUpdateUser({ db, ...baseArgs })

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE users SET defra_id = $1'),
      [DEFRA_ID, 'Test', 'User', EMAIL]
    )
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE users SET email = $2'),
      [DEFRA_ID, EMAIL, 'Test', 'User']
    )
  })

  it('should return the user id', async () => {
    const db = mockDb()

    const result = await dbUpdateUser({ db, ...baseArgs })

    expect(result).toEqual({ userId: mockUserId })
  })

  it('should return null when no user row exists for this defra id', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    const result = await dbUpdateUser({ db, ...baseArgs })

    expect(result).toBeNull()
  })

  it('should not touch the organisation tables when no user row exists for this defra id', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await dbUpdateUser({
      db,
      ...baseArgs,
      organisationDefraId: '27d48d6c-6e94-f011-b4cc-000d3ac28f39',
      organisationName: 'CDP Child Org 1'
    })

    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('should upsert the organisation and link when an org is present', async () => {
    const db = mockDb()

    await dbUpdateUser({
      db,
      ...baseArgs,
      organisationDefraId: '27d48d6c-6e94-f011-b4cc-000d3ac28f39',
      organisationName: 'CDP Child Org 1',
      relationshipType: 'Employee'
    })

    expect(db.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO organisations'),
      ['27d48d6c-6e94-f011-b4cc-000d3ac28f39', 'CDP Child Org 1']
    )
    expect(db.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO user_organisations'),
      [mockUserId, '27d48d6c-6e94-f011-b4cc-000d3ac28f39', 'Employee']
    )
  })

  it('should store a null relationship type when none is provided', async () => {
    const db = mockDb()

    await dbUpdateUser({
      db,
      ...baseArgs,
      organisationDefraId: '27d48d6c-6e94-f011-b4cc-000d3ac28f39',
      organisationName: 'CDP Child Org 1'
    })

    expect(db.query).toHaveBeenNthCalledWith(4, expect.anything(), [
      mockUserId,
      '27d48d6c-6e94-f011-b4cc-000d3ac28f39',
      null
    ])
  })

  it('should not touch the organisation tables when no org is present', async () => {
    const db = mockDb()

    await dbUpdateUser({ db, ...baseArgs })

    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('should not touch the organisation tables when the relationship type is Citizen', async () => {
    const db = mockDb()

    await dbUpdateUser({
      db,
      ...baseArgs,
      organisationDefraId: '27d48d6c-6e94-f011-b4cc-000d3ac28f39',
      organisationName: 'CDP Child Org 1',
      relationshipType: 'Citizen'
    })

    expect(db.query).toHaveBeenCalledTimes(2)
  })
})
