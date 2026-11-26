import { config } from '../config.js'
import { ssclSftp } from './sscl-sftp.js'
import { generatePgpTestKeys } from '../test-utils/pgp-test-keys.js'
import { registerOnTestServer } from '../test-utils/plugin-test-server.js'
import {
  loadMoveitTestConfig,
  loadUsableMoveitTestConfig,
  toBase64
} from '../test-utils/sscl-test-helpers.js'

const environmentSetting = 'cdpEnvironment'
const testEnabledSetting = 'sscl.testEnabled'

describe('ssclSftp plugin', () => {
  const original = {
    environment: config.get(environmentSetting),
    sscl: config.get('sscl')
  }

  afterEach(() => {
    config.set(environmentSetting, original.environment)
    config.load({ sscl: original.sscl })
  })

  let keys

  beforeAll(async () => {
    keys = await generatePgpTestKeys()
  })

  it('stops the server starting in prod when the test route is on', async () => {
    config.set(environmentSetting, 'prod')
    loadMoveitTestConfig()
    config.set(testEnabledSetting, true)

    await expect(registerOnTestServer(ssclSftp)).rejects.toThrow(
      'SSCL_SFTP_TEST_ENABLED must not be true in prod'
    )
  })

  it('stops the server starting when the test route has no MOVEit settings', async () => {
    config.set(environmentSetting, 'test')
    config.load({ sscl: { testEnabled: true } })

    await expect(registerOnTestServer(ssclSftp)).rejects.toThrow(
      'sscl.sftp.host is not set'
    )
  })

  it('stops the server starting when a MOVEit key cannot be read', async () => {
    config.set(environmentSetting, 'test')
    loadUsableMoveitTestConfig({ keys })
    config.set(testEnabledSetting, true)
    config.set('sscl.sftp.hostKey', toBase64('junk'))

    await expect(registerOnTestServer(ssclSftp)).rejects.toThrow(
      'sscl.sftp.hostKey is not a valid SFTP host key'
    )
  })

  it('registers in prod when the test route is off', async () => {
    config.set(environmentSetting, 'prod')
    config.load({ sscl: { testEnabled: false } })

    await expect(registerOnTestServer(ssclSftp)).resolves.toBeDefined()
  })

  it.each([
    [false, []],
    [true, ['/sftp/test-file']]
  ])(
    'with SSCL_SFTP_TEST_ENABLED=%s registers routes %j',
    async (testEnabled, paths) => {
      loadUsableMoveitTestConfig({ keys })
      config.set(testEnabledSetting, testEnabled)

      const server = await registerOnTestServer(ssclSftp)

      expect(server.table().map((route) => route.path)).toEqual(paths)
    }
  )
})
