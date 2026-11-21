import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { assertSsclConfig } from '../services/sftp/get-sscl-client.js'
import { sftpTestFile } from '../routes/sftp.js'

const logger = createLogger()

/**
 * SSCL file exchange over SFTP to MOVEit. Refuses to register (so the server
 * won't start) if the SSCL switch or MOVEit settings are wrong for this
 * environment, and only exposes the test route when SSCL_SFTP_TEST_ENABLED is on.
 */
const ssclSftp = {
  plugin: {
    name: 'sscl-sftp',
    register: async (server) => {
      await assertSsclConfig()
      if (!config.get('sscl.testEnabled')) {
        logger.info({}, 'SSCL SFTP test route is disabled')
        return
      }

      server.route(sftpTestFile)
      logger.info({}, 'SSCL SFTP test route enabled')
    }
  }
}

export { ssclSftp }
