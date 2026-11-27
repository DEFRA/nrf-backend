import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { assertSsclConfig } from '../services/sftp/get-sscl-client.js'
import { sftpTestFile } from '../routes/sftp.js'

const logger = createLogger()

/**
 * SSCL file exchange over SFTP to MOVEit. Refuses to register (so the server
 * won't start) if the SSCL switch or MOVEit settings are wrong for this
 * environment, and only exposes the test route when SSCL_SFTP_TEST_ENABLED is on.
 * The route is registered here, not by the router plugin, so it doesn't exist
 * at all when switched off.
 */
const ssclSftp = {
  plugin: {
    name: 'sscl-sftp',
    register: async (server) => {
      await assertSsclConfig()
      const testEnabled = config.get('sscl.testEnabled')
      if (testEnabled) {
        server.route(sftpTestFile)
      }
      logger.info({ sscl: { testEnabled } }, 'SSCL SFTP plugin registered')
    }
  }
}

export { ssclSftp }
