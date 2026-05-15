import { postController } from '../api/quote/post-controller.js'
import { getController } from '../api/quote/get-controller.js'
import { getAllController } from '../api/quote/get-all-controller.js'
import { patchController } from '../api/quote/patch-controller.js'

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
  }
]

export { quote, routePath }
