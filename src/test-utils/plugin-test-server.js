import Hapi from '@hapi/hapi'

/**
 * A bare hapi server with only the given plugin registered, for testing what
 * a plugin does when it registers.
 * @param {Parameters<import('@hapi/hapi').Server['register']>[0]} plugin
 */
export const registerOnTestServer = async (plugin) => {
  const server = Hapi.server()
  await server.register(plugin)
  return server
}
