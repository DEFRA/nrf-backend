import { postController } from '../api/quote/post-controller.js'
import { getController } from '../api/quote/get-controller.js'
import { getAllController } from '../api/quote/get-all-controller.js'
import { patchController } from '../api/quote/patch-controller.js'
import { deleteController } from '../api/quote/delete-controller.js'
import { emailQuoteLinkController } from '../api/quote/email-quote-link-controller.js'
import { redeemTokenController } from '../api/quote/redeem-token-controller.js'

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
    method: 'DELETE',
    path: `${routePath}/{reference}`,
    ...deleteController
  },
  {
    method: 'POST',
    path: `${routePath}/email-quote-link`,
    ...emailQuoteLinkController
  },
  {
    method: 'POST',
    path: `${routePath}/{reference}/redeem-token`,
    ...redeemTokenController
  }
]

export { quote, routePath }
