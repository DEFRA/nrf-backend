import Hapi from '@hapi/hapi'

import { config } from '../config.js'
import { ssclSftp } from './sscl-sftp.js'
import { generatePgpTestKeys } from '../test-utils/pgp-test-keys.js'
import {
  loadMoveitTestConfig,
  loadUsableMoveitTestConfig,
  toBase64
} from '../test-utils/sscl-test-helpers.js'

describe('ssclSftp plugin', () => {
  const original = {
    environment: config.get('cdpEnvironment'),
    sscl: config.get('sscl')
  }

  afterEach(() => {
    config.set('cdpEnvironment', original.environment)
    config.load({ sscl: original.sscl })
  })

  let keys

  beforeAll(async () => {
    keys = await generatePgpTestKeys()
  })

  const registerOn = async () => {
    const server = Hapi.server()
    await server.register(ssclSftp)
    return server
  }

  it('stops the server starting in prod when the test route is on', async () => {
    config.set('cdpEnvironment', 'prod')
    loadMoveitTestConfig()
    config.set('sscl.testEnabled', true)

    await expect(registerOn()).rejects.toThrow(
      'SSCL_SFTP_TEST_ENABLED must not be true in prod'
    )
  })

  it('stops the server starting when the test route has no MOVEit settings', async () => {
    config.set('cdpEnvironment', 'test')
    config.load({ sscl: { testEnabled: true } })

    await expect(registerOn()).rejects.toThrow('sscl.sftp.host is not set')
  })

  it('stops the server starting when a MOVEit key cannot be read', async () => {
    config.set('cdpEnvironment', 'test')
    loadUsableMoveitTestConfig({ keys })
    config.set('sscl.testEnabled', true)
    config.set('sscl.sftp.hostKey', toBase64('junk'))

    await expect(registerOn()).rejects.toThrow(
      'sscl.sftp.hostKey is not a valid SFTP host key'
    )
  })

  it('registers in prod when the test route is off', async () => {
    config.set('cdpEnvironment', 'prod')
    config.load({ sscl: { testEnabled: false } })

    await expect(registerOn()).resolves.toBeDefined()
  })

  it.each([
    [false, []],
    [true, ['/sftp/test-file']]
  ])(
    'with SSCL_SFTP_TEST_ENABLED=%s registers routes %j',
    async (testEnabled, paths) => {
      loadUsableMoveitTestConfig({ keys })
      config.set('sscl.testEnabled', testEnabled)

      const server = await registerOn()

      expect(server.table().map((route) => route.path)).toEqual(paths)
    }
  )
})
