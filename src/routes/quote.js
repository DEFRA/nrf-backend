import { postController } from '../api/quote/post-controller.js'
import { getController } from '../api/quote/get-controller.js'

const routePath = '/quotes'

const quote = [
  {
    method: 'POST',
    path: routePath,
    ...postController
  },
  {
    method: 'GET',
    path: `${routePath}/{reference}`,
    ...getController
  }
]

export { quote, routePath }
