import { patchController } from '../api/users/patch-controller.js'

const routePath = '/users'

const users = [
  {
    method: 'PATCH',
    path: routePath,
    ...patchController
  }
]

export { users, routePath }
