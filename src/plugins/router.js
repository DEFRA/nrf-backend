import { health } from '../routes/health.js'
import { version } from '../routes/version.js'
import { initiateUpload, uploadStatus } from '../routes/upload.js'
import { checkBoundaryRoute } from '../routes/boundary.js'
import { quote } from '../routes/quote.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route(
        [
          health,
          version,
          initiateUpload,
          uploadStatus,
          checkBoundaryRoute
        ].concat(quote)
      )
    }
  }
}

export { router }
