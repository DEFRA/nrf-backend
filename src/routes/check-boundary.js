import { checkBoundaryController } from '../api/quote/check-boundary-controller.js'

const routePath = '/quote/check-boundary/{id}'

const checkBoundary = {
  method: 'POST',
  path: routePath,
  ...checkBoundaryController
}

export { checkBoundary, routePath }
