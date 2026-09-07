import { setupTestServer } from '../../../test-utils/setup-test-server.js'

describe('quote_edp_results schema', () => {
  const getServer = setupTestServer()

  const columns = async () => {
    const { rows } = await getServer().pg.query(
      `SELECT column_name, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_name = 'quote_edp_results'`
    )
    return Object.fromEntries(rows.map((row) => [row.column_name, row]))
  }

  it('has a nullable catchments jsonb column', async () => {
    const { catchments } = await columns()

    expect(catchments).toBeDefined()
    expect(catchments.data_type).toBe('jsonb')
    expect(catchments.is_nullable).toBe('YES')
  })

  it('allows edp_id, edp_type and impact to be null for placeholder rows', async () => {
    const all = await columns()

    expect(all.edp_id.is_nullable).toBe('YES')
    expect(all.edp_type.is_nullable).toBe('YES')
    expect(all.impact.is_nullable).toBe('YES')
  })

  it('has a unique index over placeholder rows only', async () => {
    const { rows } = await getServer().pg.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'quote_edp_results'
          AND indexname = 'uq_quote_edp_results_placeholder_name'`
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toContain('UNIQUE')
    expect(rows[0].indexdef).toContain('quote_id')
    expect(rows[0].indexdef).toContain('edp_name')
    expect(rows[0].indexdef).toContain('WHERE (edp_id IS NULL)')
  })
})
