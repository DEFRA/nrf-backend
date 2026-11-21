/**
 * Fails startup if the SSCL test route is on in prod, where it would push a
 * test file into SSCL's live invoice folder and take SSCL's files out of the
 * live pull folder.
 * @param {{ testEnabled: boolean, environment: string }} params
 */
export function assertSsclSwitchesAllowed({ testEnabled, environment }) {
  if (testEnabled && environment === 'prod') {
    throw new Error('SSCL_SFTP_TEST_ENABLED must not be true in prod')
  }
}
