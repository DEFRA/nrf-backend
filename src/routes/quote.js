import { postController } from '../api/quote/post-controller.js'

const routePath = '/quote'

const quote = [
  {
    method: 'POST',
    path: routePath,
    ...postController
  }
]

export { quote, routePath }
