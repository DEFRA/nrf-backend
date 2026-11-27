export const testPlugin = {
  plugin: {
    name: 'test-plugin',
    register(server) {
      server.route({
        method: 'GET',
        path: '/test',
        handler(_request, h) {
          return h.response('ok')
        }
      })
    }
  }
}

export const failingTestPlugin = {
  plugin: {
    name: 'failing-plugin',
    register() {
      throw new Error('bad config')
    }
  }
}
