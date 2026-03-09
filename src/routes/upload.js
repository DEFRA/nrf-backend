import {
  initiateUpload as initiateUploadService,
  getUploadStatus
} from '../services/cdp-uploader/cdp-uploader.js'

const initiateUpload = {
  method: 'POST',
  path: '/upload/initiate',
  handler: async (request, h) => {
    const result = await initiateUploadService(request.payload)
    return h.response(result)
  }
}

const uploadStatus = {
  method: 'GET',
  path: '/upload/{uploadId}/status',
  handler: async (request, h) => {
    const result = await getUploadStatus(request.params.uploadId)
    return h.response(result)
  }
}

export { initiateUpload, uploadStatus }
