# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**IMPORTANT:**

- Before making any code changes, read `.ai/rules/index.md` for coding standards and patterns.
- Always run `nvm use` before running any commands to ensure the correct Node version (v24) is active. The project requires Node >=24 and has a `.nvmrc` file.

## Project Overview

This is a DEFRA CDP (Core Delivery Platform) Node.js backend service built with Hapi.js. It provides REST API endpoints and comprehensive observability features.

## Development Commands

Key npm scripts are defined in package.json.

### Docker

See compose.yml for local environment setup (includes localstack, Redis).
See Dockerfile for build targets (development, production).

## Architecture

### Server Initialization Flow

1. `src/index.js` - Entry point that calls `startServer()`
2. `src/common/helpers/start-server.js` - Creates and starts the server
3. `src/server.js` - Exports `createServer()` which:
   - Sets up Hapi server with security headers (HSTS, XSS, noSniff, xframe)
   - Configures proxy via `setupProxy()` for outbound HTTP requests
   - Registers plugins in order:
     - `requestLogger` - Automatic request/response logging (hapi-pino)
     - `requestTracing` - CDP trace header propagation
     - `secureContext` - CA certificate loading from env
     - `pulse` - Shutdown handlers
     - `router` - Application routes

### Configuration

Uses `convict` for configuration management (src/config.js) with environment-based values and strict validation. See config.js for all available settings including proxy, logging, and tracing options.

### Routing

Routes are defined in `src/routes/` and registered via `src/plugins/router.js`. Each route file exports an array of route configs.

### Proxy Configuration

The app uses a forward-proxy for all outbound HTTP requests. Setup in src/common/helpers/proxy/setup-proxy.js configures a global ProxyAgent dispatcher via `undici`, so `fetch()` automatically uses the proxy. See setup-proxy.js for custom HTTP client configuration examples.

### Testing Setup

Tests use Vitest (configured in vitest.config.js) with:

- Fetch mocking setup in .vite/setup-files.js
- **Important:** `mockReset: true` is set globally — this calls `vi.resetAllMocks()` before each test, clearing both call history and implementations. Do not add `vi.clearAllMocks()` or `vi.resetAllMocks()` to individual test files. If a mock needs a specific return value, set it in `beforeEach` (not `beforeAll` or at the module level inside a factory).

### Logging

Logging configuration in src/config.js determines format (ECS for production, pino-pretty for development). Automatic request/response logging via hapi-pino. Logger available as `server.logger` in plugins/lifecycle methods. Use `createLogger()` helper from src/common/helpers/logging/logger.js for standalone logging.

### Security Headers

Configured in server.js routes.security (HSTS, XSS protection, noSniff, X-Frame-Options).

### Validation

Uses Joi for validation. Server validation options and custom fail action configured in src/server.js (routes.validate). See src/common/helpers/fail-action.js for error formatting.

## Key Patterns

### Error Handling

Use `@hapi/boom` for HTTP errors:

```javascript
import Boom from '@hapi/boom'
if (!entity) return Boom.notFound()
```

### Module System

The project uses ES modules (`"type": "module"` in package.json). All imports use `.js` extensions.

## Important Notes

- Node.js and npm version requirements defined in package.json engines field
- Use nvm for Node version management (`nvm use` reads from .nvmrc)
- Tests run with `TZ=UTC` to ensure consistent timezone handling (see package.json test script)
- Git pre-commit hook configured in package.json git:pre-commit-hook script
- Example routes and data models can be removed as needed (src/routes/example.js, src/example-find.js)
