/**
 * Waits for work, but rejects with makeError() once timeoutMs has passed, then
 * calls onTimeout (for example to close a connection). The work itself is not
 * stopped and may still finish later.
 * @template T
 * @param {{ timeoutMs: number, work: () => Promise<T>, makeError: () => Error, onTimeout?: () => void }} params
 * @returns {Promise<T>}
 */
export async function withTimeout({
  timeoutMs,
  work,
  makeError,
  onTimeout = () => {}
}) {
  let timer
  const timedOut = new Promise((_resolve, reject) => {
    timer = setTimeout(function onTimedOut() {
      reject(makeError())
      onTimeout()
    }, timeoutMs)
  })
  try {
    return await Promise.race([work(), timedOut])
  } finally {
    clearTimeout(timer)
  }
}
