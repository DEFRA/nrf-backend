Audit and fix the @openapi JSDoc annotations across all API route and controller files so the Swagger documentation matches the actual endpoint implementations.

## Steps

1. Read the swagger-jsdoc config in `src/plugins/swagger.js` to find the file globs that are scanned for annotations (the `apis` array).

2. For every file matched by those globs, read the file and compare:
   - The `@openapi` JSDoc block (if present) against the actual route definition below it.
   - Check: HTTP method, path, request body / payload schema, path and query parameters, response status codes and shapes.
   - If a route exists but has no `@openapi` block, add one.
   - If an `@openapi` block is present but incorrect or incomplete, fix it.

3. Specific things to verify for each endpoint:
   - **Method and path** match the route's `method` and `path` fields.
   - **Request body**: if the route has `validate.payload` (Joi), the `@openapi` `requestBody` schema should list the same fields, types, required fields, and formats.
   - **Path parameters**: if the route path has `{param}` segments or `validate.params`, the `@openapi` block should have matching `parameters` entries.
   - **Query parameters**: if the route has `validate.query`, document them.
   - **Response codes**: match what the handler actually returns (e.g. `h.response().code(201)` → 201, Boom.notFound → 404).
   - **Tags**: should be present and grouped logically (e.g. by resource).

4. After making changes, run `npm test` to verify nothing is broken.

5. Summarise what was changed or confirmed correct.
