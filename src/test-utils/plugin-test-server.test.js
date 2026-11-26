import { registerOnTestServer } from './plugin-test-server.js'

const testPlugin = {
  plugin: {
    name: 'test-plugin',
    register(server) {
      server.route({ method: 'GET', path: '/test', handler: () => 'ok' })
    }
  }
}

describe('registerOnTestServer', () => {
  it('gives a server with only the given plugin registered', async () => {
    const server = await registerOnTestServer(testPlugin)

    expect(Object.keys(server.registrations)).toEqual(['test-plugin'])
    expect(server.table().map((route) => route.path)).toEqual(['/test'])
  })

  it('fails when the plugin fails to register', async () => {
    const failing = {
      plugin: {
        name: 'failing-plugin',
        register() {
          throw new Error('bad config')
        }
      }
    }

    await expect(registerOnTestServer(failing)).rejects.toThrow('bad config')
  })
})
