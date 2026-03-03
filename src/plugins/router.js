import { health } from '../routes/health.js'
import { quote } from '../routes/quote.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health].concat(quote))
    }
  }
}

export { router }
