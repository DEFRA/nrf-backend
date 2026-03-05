import { execSync } from 'node:child_process'

const COMPOSE = 'docker compose -f compose.test.yml -p nrf-backend-test'

function isPostgresRunning() {
  try {
    const result = execSync(`${COMPOSE} ps -q postgres`, { stdio: 'pipe' })
    return result.toString().trim().length > 0
  } catch {
    return false
  }
}

function isSchemaReady() {
  try {
    execSync(
      `${COMPOSE} exec -T postgres psql -U postgres -d nrf_backend -c "SELECT 1 FROM quotes LIMIT 1"`,
      { stdio: 'pipe' }
    )
    return true
  } catch {
    return false
  }
}

export default async function setup() {
  const postgresAlreadyRunning = isPostgresRunning()

  if (!postgresAlreadyRunning) {
    execSync(`${COMPOSE} up -d postgres --wait`, { stdio: 'inherit' })
  }

  if (!isSchemaReady()) {
    execSync(`${COMPOSE} up liquibase`, { stdio: 'inherit' })
  }
}
