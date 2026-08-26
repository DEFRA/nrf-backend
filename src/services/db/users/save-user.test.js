import { dbSaveUser } from './save-user.js'

const DEFRA_ID = '81d48d6c-6e94-f011-b4cc-000d3ac28f39'
const EMAIL = 'developer@housebuilder.com'

describe('dbSaveUser', () => {
  const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

  const mockDb = (created) => ({
    query: vi.fn().mockResolvedValue({ rows: [{ id: mockUserId, created }] })
  })

  const baseArgs = {
    defraId: DEFRA_ID,
    email: EMAIL,
    firstName: 'Test',
    lastName: 'User'
  }

  it('should merge an email-only record and upsert the user by defra id', async () => {
    const db = mockDb(true)

    await dbSaveUser({ db, ...baseArgs })

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE users SET defra_id = $1'),
      [DEFRA_ID, 'Test', 'User', EMAIL]
    )
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO users'),
      [DEFRA_ID, EMAIL, 'Test', 'User']
    )
  })

  it('should return the user id and created flag', async () => {
    const db = mockDb(true)

    const result = await dbSaveUser({ db, ...baseArgs })

    expect(result).toEqual({ userId: mockUserId, userCreated: true })
  })

  it('should report an existing row as not created', async () => {
    const db = mockDb(false)

    const result = await dbSaveUser({ db, ...baseArgs })

    expect(result).toEqual({ userId: mockUserId, userCreated: false })
  })

  it('should upsert the organisation and link when an org is present', async () => {
    const db = mockDb(true)

    await dbSaveUser({
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
    const db = mockDb(true)

    await dbSaveUser({
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
    const db = mockDb(true)

    await dbSaveUser({ db, ...baseArgs })

    expect(db.query).toHaveBeenCalledTimes(2)
  })
})
