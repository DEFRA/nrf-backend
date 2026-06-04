import { postController } from '../api/quote/post-controller.js'
import { getController } from '../api/quote/get-controller.js'
import { getAllController } from '../api/quote/get-all-controller.js'
import { patchController } from '../api/quote/patch-controller.js'
import { resendKnownController } from '../api/quote/resend-known-controller.js'
import { resendUnknownController } from '../api/quote/resend-unknown-controller.js'

const routePath = '/quotes'

const quote = [
  {
    method: 'POST',
    path: routePath,
    ...postController
  },
  {
    method: 'GET',
    path: routePath,
    ...getAllController
  },
  {
    method: 'GET',
    path: `${routePath}/{reference}`,
    ...getController
  },
  {
    method: 'PATCH',
    path: `${routePath}/{reference}`,
    ...patchController
  },
  {
    method: 'POST',
    path: `${routePath}/{reference}/resend-known`,
    ...resendKnownController
  },
  {
    method: 'POST',
    path: `${routePath}/{reference}/resend-unknown`,
    ...resendUnknownController
  }
]

export { quote, routePath }
