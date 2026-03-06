import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['int-tests/**/*.test.js'],
    globals: false,
    setupFiles: [],
    globalSetup: []
  }
})
