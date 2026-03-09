import { execSync } from 'node:child_process'

const COMPOSE = 'docker compose -f compose.test.yml -p nrf-backend-test'

function isServiceRunning(service) {
  try {
    const result = execSync(`${COMPOSE} ps -q ${service}`, { stdio: 'pipe' })
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
  if (!isServiceRunning('postgres')) {
    execSync(`${COMPOSE} up -d postgres --wait`, { stdio: 'inherit' })
  }

  if (!isSchemaReady()) {
    execSync(`${COMPOSE} up liquibase`, { stdio: 'inherit' })
  }

  if (!isServiceRunning('cdp-uploader')) {
    execSync(`${COMPOSE} up -d cdp-uploader --wait`, { stdio: 'inherit' })
  }
}
