import { dbGetUser } from './get-user.js'

const DEFRA_ID = '81d48d6c-6e94-f011-b4cc-000d3ac28f39'
const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const EMAIL = 'developer@housebuilder.com'

const userRow = {
  id: USER_ID,
  defra_id: DEFRA_ID,
  email: EMAIL,
  first_name: 'Test',
  last_name: 'User',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-02T00:00:00Z'),
  first_signed_in_at: new Date('2026-01-03T00:00:00Z'),
  organisation_defra_id: null,
  organisation_name: null,
  relationship_type: null
}

const orgRow = (defraId, name, relationshipType) => ({
  ...userRow,
  organisation_defra_id: defraId,
  organisation_name: name,
  relationship_type: relationshipType
})

describe('dbGetUser', () => {
  it('should query the user by defra id with a bound parameter', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [userRow] }) }

    await dbGetUser({ db, defraId: DEFRA_ID })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE u.defra_id = $1'),
      [DEFRA_ID]
    )
  })

  it('should return null when no user has the defra id', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await expect(dbGetUser({ db, defraId: DEFRA_ID })).resolves.toBeNull()
  })

  it('should map the user record to camelCase with an empty organisations array', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [userRow] }) }

    const user = await dbGetUser({ db, defraId: DEFRA_ID })

    expect(user).toEqual({
      id: USER_ID,
      defraId: DEFRA_ID,
      email: EMAIL,
      firstName: 'Test',
      lastName: 'User',
      createdAt: userRow.created_at,
      updatedAt: userRow.updated_at,
      firstSignedInAt: userRow.first_signed_in_at,
      organisations: []
    })
  })

  it('should include each linked organisation with its relationship type', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          orgRow('27d48d6c-01', 'CDP Child Org 1', 'Employee'),
          orgRow('27d48d6c-02', 'CDP Child Org 2', null)
        ]
      })
    }

    const user = await dbGetUser({ db, defraId: DEFRA_ID })

    expect(user.organisations).toEqual([
      {
        defraId: '27d48d6c-01',
        name: 'CDP Child Org 1',
        relationshipType: 'Employee'
      },
      {
        defraId: '27d48d6c-02',
        name: 'CDP Child Org 2',
        relationshipType: null
      }
    ])
  })

  it('should return null name and first/last names when they are not set', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ ...userRow, first_name: null, last_name: null }]
      })
    }

    const user = await dbGetUser({ db, defraId: DEFRA_ID })

    expect(user.firstName).toBeNull()
    expect(user.lastName).toBeNull()
  })
})
