# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a DEFRA CDP (Core Delivery Platform) Node.js backend service built with Hapi.js. It provides REST API endpoints with MongoDB integration, distributed locking, and comprehensive observability features.

## Development Commands

Key npm scripts are defined in package.json. Most commonly used:

### Running the application

- `npm run dev` - Development mode with hot reload
- `npm start` - Production mode

### Testing

- `npm test` - Run all tests with coverage
- `npm run test:watch` - Watch mode
- Run single test: `npx vitest run path/to/test.test.js`
- Run single test in watch mode: `npx vitest path/to/test.test.js`

### Code Quality

- `npm run lint` and `npm run lint:fix` - ESLint
- `npm run format` and `npm run format:check` - Prettier

### Docker

See compose.yml for local environment setup (includes localstack, MongoDB, Redis).
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
     - `mongoDb` - MongoDB connection pool and lock manager
     - `router` - Application routes

### Configuration

Uses `convict` for configuration management (src/config.js) with environment-based values and strict validation. See config.js for all available settings including MongoDB, proxy, logging, and tracing options.

### MongoDB Plugin Architecture

The `mongoDb` plugin (src/common/helpers/mongodb.js) decorates both server and request objects:

- `server.mongoClient` - Raw MongoClient instance
- `server.db` - Database instance
- `server.locker` - LockManager instance from mongo-locks
- `request.db` - Database instance (accessible in route handlers)
- `request.locker` - LockManager instance (accessible in route handlers)

The plugin also creates indexes on startup via `createIndexes()`.

### Distributed Locking

MongoDB-based distributed locks are available via `server.locker` or `request.locker`:

```javascript
async function doStuff(server) {
  const lock = await server.locker.lock('unique-resource-name')
  if (!lock) {
    // Lock unavailable
    return
  }
  try {
    // do atomic work
  } finally {
    await lock.free()
  }
}
```

Helper functions in `src/common/helpers/mongo-lock.js`:

- `acquireLock(locker, resource, logger)` - Returns null if unavailable
- `requireLock(locker, resource)` - Throws if unavailable

Locks support `using` syntax for automatic cleanup (though coverage reports don't like it).

### Routing

Routes are defined in `src/routes/` and registered via `src/plugins/router.js`. Each route file exports an array of route configs.

Route handlers receive `request` and `h` (response toolkit):

```javascript
{
  method: 'GET',
  path: '/example/{id}',
  handler: async (request, h) => {
    const data = await request.db.collection('name').findOne({...})
    return h.response({ message: 'success', data })
  }
}
```

### Proxy Configuration

The app uses a forward-proxy for all outbound HTTP requests. Setup in src/common/helpers/proxy/setup-proxy.js configures a global ProxyAgent dispatcher via `undici`, so `fetch()` automatically uses the proxy. See setup-proxy.js for custom HTTP client configuration examples.

### Testing Setup

Tests use Vitest (configured in vitest.config.js) with:

- MongoDB Memory Server setup in .vite/mongo-memory-server.js (auto-sets MONGO_URI)
- Fetch mocking setup in .vite/setup-files.js
- **Important:** `clearMocks: true` is set globally - do not add `vi.clearAllMocks()` to individual test files

### Logging

Logging configuration in src/config.js determines format (ECS for production, pino-pretty for development). Automatic request/response logging via hapi-pino. Logger available as `server.logger` in plugins/lifecycle methods. Use `createLogger()` helper from src/common/helpers/logging/logger.js for standalone logging.

### Security Headers

Configured in server.js routes.security (HSTS, XSS protection, noSniff, X-Frame-Options).

### Validation

Uses Joi for validation. Server validation options and custom fail action configured in src/server.js (routes.validate). See src/common/helpers/fail-action.js for error formatting.

## Key Patterns

### Database Queries

MongoDB queries in this codebase typically exclude the `_id` field using projections:

```javascript
db.collection('name').find({}, { projection: { _id: 0 } })
```

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
