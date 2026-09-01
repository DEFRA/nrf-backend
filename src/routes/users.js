import { getController } from '../api/users/get-controller.js'
import { patchController } from '../api/users/patch-controller.js'

const routePath = '/users'

const users = [
  {
    method: 'GET',
    path: routePath,
    ...getController
  },
  {
    method: 'PATCH',
    path: routePath,
    ...patchController
  }
]

export { users, routePath }
