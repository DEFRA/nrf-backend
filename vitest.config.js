import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    mockReset: true,
    env: {
      DB_PORT: '5433',
      CDP_UPLOADER_URL: 'http://localhost:7338',
      S3_ENDPOINT: 'http://localhost:4567',
      S3_FORCE_PATH_STYLE: 'true',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      AWS_REGION: 'eu-west-2',
      BACKEND_API_KEY: 'test-api-key'
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: [...configDefaults.exclude, 'coverage']
    },
    setupFiles: ['.vite/setup-files.js'],
    globalSetup: ['.vite/global-setup.js']
  }
})
