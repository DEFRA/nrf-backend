import { health } from '../routes/health.js'
import { version } from '../routes/version.js'
import { initiateUpload, uploadStatus } from '../routes/upload.js'
import {
  checkBoundaryRoute,
  checkBoundaryGeometryRoute
} from '../routes/boundary.js'
import { quote } from '../routes/quote.js'
import { users } from '../routes/users.js'

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
          checkBoundaryRoute,
          checkBoundaryGeometryRoute,
          ...users
        ].concat(quote)
      )
    }
  }
}

export { router }
