import { withTimeout } from './with-timeout.js'

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns what the work returns when it finishes in time', async () => {
    const onTimeout = vi.fn()

    await expect(
      withTimeout({
        timeoutMs: 100,
        work: async () => 'done',
        makeError: () => new Error('late'),
        onTimeout
      })
    ).resolves.toBe('done')
    await vi.advanceTimersByTimeAsync(100)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('passes on the work failing', async () => {
    await expect(
      withTimeout({
        timeoutMs: 100,
        work: () => Promise.reject(new Error('broken')),
        makeError: () => new Error('late')
      })
    ).rejects.toThrow('broken')
  })

  it('rejects with the given error and calls onTimeout once the time is up', async () => {
    const onTimeout = vi.fn()
    const outcome = withTimeout({
      timeoutMs: 100,
      work: () => new Promise(() => {}),
      makeError: () => new Error('late'),
      onTimeout
    })
    const rejected = expect(outcome).rejects.toThrow('late')

    await vi.advanceTimersByTimeAsync(99)
    expect(onTimeout).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    await rejected
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
})
