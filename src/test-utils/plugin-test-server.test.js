import { registerOnTestServer } from './plugin-test-server.js'
import { failingTestPlugin, testPlugin } from './fixtures/plugins.js'

describe('registerOnTestServer', () => {
  it('gives a server with only the given plugin registered', async () => {
    const server = await registerOnTestServer(testPlugin)

    expect(Object.keys(server.registrations)).toEqual(['test-plugin'])
    expect(server.table().map((route) => route.path)).toEqual(['/test'])
  })

  it('fails when the plugin fails to register', async () => {
    await expect(registerOnTestServer(failingTestPlugin)).rejects.toThrow(
      'bad config'
    )
  })
})
