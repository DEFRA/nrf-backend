import { health } from '../routes/health.js'
import { initiateUpload, uploadStatus } from '../routes/upload.js'
import { quote } from '../routes/quote.js'
import { checkBoundary } from '../routes/check-boundary.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route(
        [health, initiateUpload, uploadStatus, checkBoundary].concat(quote)
      )
    }
  }
}

export { router }
