export const testPlugin = {
  plugin: {
    name: 'test-plugin',
    register(server) {
      server.route({ method: 'GET', path: '/test', handler: () => 'ok' })
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
