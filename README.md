# nrf-backend

Core delivery platform Node.js Backend Template.

- [nrf-backend](#nrf-backend)
  - [Requirements](#requirements)
    - [Node.js](#nodejs)
  - [Local development](#local-development)
    - [Testing](#testing)
    - [Npm scripts](#npm-scripts)
    - [Update dependencies](#update-dependencies)
    - [Formatting](#formatting)
      - [Windows prettier issue](#windows-prettier-issue)
    - [API documentation](#api-documentation)
    - [Keeping Swagger docs in sync](#keeping-swagger-docs-in-sync)
  - [Development helpers](#development-helpers)
    - [Proxy](#proxy)
  - [Docker](#docker)
    - [Development image](#development-image)
    - [Production image](#production-image)
    - [Dependabot](#dependabot)
    - [SonarCloud](#sonarcloud)
  - [Licence](#licence)
    - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v22` and [npm](https://nodejs.org/) `>= v11`. You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd nrf-backend
nvm use
```

## Local development

The backend runs locally as part of the [nrf-solution](https://github.com/DEFRA/nrf-solution) meta-repo: `tilt up` from the nrf-solution root brings up the full stack — this service, its Docker Compose dependencies (LocalStack, Postgres, Redis, CDP Uploader) — with hot reload.

See the [nrf-solution README](https://github.com/DEFRA/nrf-solution/blob/main/README.md) for setup, ports and troubleshooting.

### Testing

To test the application run:

```bash
npm run test
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json).
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

### API documentation

Swagger UI is available at `/docs` when the server is running.
The OpenAPI spec is generated from `@openapi` JSDoc annotations in the route and controller files.

### Keeping Swagger docs in sync

An AI (Claude Code) skill is provided to audit and fix the `@openapi` annotations so they match the actual endpoint implementations.

Run it from nrf-solution with:

```shell
/sync-swagger
```

## Development helpers

### Proxy

We are using forward-proxy which is set up by default. To make use of this: `import { fetch } from 'undici'` then
because of the `setGlobalDispatcher(new ProxyAgent(proxyUrl))` calls will use the ProxyAgent Dispatcher

If you are not using Wreck, Axios or Undici or a similar http that uses `Request`. Then you may have to provide the
proxy dispatcher:

To add the dispatcher to your own client:

```javascript
import { ProxyAgent } from 'undici'

return await fetch(url, {
  dispatcher: new ProxyAgent({
    uri: proxyUrl,
    keepAliveTimeout: 10,
    keepAliveMaxTimeout: 10
  })
})
```

## Docker

### Development image

Build:

```bash
docker build --target development --no-cache --tag nrf-backend:development .
```

Run:

```bash
docker run -e PORT=3001 -p 3001:3001 nrf-backend:development
```

### Production image

Build:

```bash
docker build --no-cache --tag nrf-backend .
```

Run:

```bash
docker run -e PORT=3001 -p 3001:3001 nrf-backend
```

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties)

## Database diagram

[Quote database diagram](./docs/quote-database-diagram.md)

Generated using the `create-database-diagram` skill in [nrf-solution](https://github.com/DEFRA/nrf-solution) repository.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
