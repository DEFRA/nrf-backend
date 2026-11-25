import { createSftpTransport } from '../services/sftp/sftp-transport.js'
import { startSftpFaultServer } from './sftp-fault-server.js'

export const sftpTestFolders = { push: '/NRLIn', pull: '/NRLOut' }

// Long enough that only a real stall reaches it, however slow the machine.
const defaultTimeoutMs = 10000

/**
 * @param {{ timeoutMs?: number, fault?: import('./sftp-fault-server.js').SftpFaultHook }} [options]
 */
export async function startSftpTestTransport({
  timeoutMs = defaultTimeoutMs,
  fault
} = {}) {
  const server = await startSftpFaultServer({
    folders: [sftpTestFolders.push, sftpTestFolders.pull],
    fault
  })
  const transport = createSftpTransport({
    connection: server.settings({ timeoutMs }),
    pushUser: 'push',
    pushFolder: sftpTestFolders.push,
    pullUser: 'pull',
    pullFolder: sftpTestFolders.pull
  })
  return { server, transport }
}
