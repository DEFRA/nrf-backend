import { execSync } from 'node:child_process'

import { ensureSftpTestKeys } from '../src/test-utils/sftp-test-keys.js'

const COMPOSE = 'docker compose -f compose.test.yml -p nrf-backend-test'

function isServiceRunning(service) {
  try {
    const result = execSync(`${COMPOSE} ps -q ${service}`, { stdio: 'pipe' })
    return result.toString().trim().length > 0
  } catch {
    return false
  }
}

function runLiquibase() {
  try {
    execSync(`${COMPOSE} up liquibase`, { stdio: 'inherit' })
    return true
  } catch {
    return false
  }
}

function resetDatabase() {
  execSync(
    `${COMPOSE} exec -T postgres psql -U postgres -d nrf_backend -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`,
    { stdio: 'inherit' }
  )
}

export default async function setup() {
  if (!isServiceRunning('postgres')) {
    execSync(`${COMPOSE} up -d postgres --wait`, { stdio: 'inherit' })
  }

  if (!runLiquibase()) {
    resetDatabase()
    runLiquibase()
  }

  if (!isServiceRunning('localstack')) {
    execSync(`${COMPOSE} up -d localstack --wait`, { stdio: 'inherit' })
  }

  if (!isServiceRunning('cdp-uploader')) {
    execSync(`${COMPOSE} up -d cdp-uploader --wait`, { stdio: 'inherit' })
  }

  const newSftpKeys = ensureSftpTestKeys()
  if (newSftpKeys || !isServiceRunning('sscl-sftp')) {
    execSync(`${COMPOSE} up -d --force-recreate sscl-sftp --wait`, {
      stdio: 'inherit'
    })
  }
}
