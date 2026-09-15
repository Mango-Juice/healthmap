const RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 10_000
const TRANSIENT_STATUSES = new Set([502, 503, 504])

const waitForRetry = (signal: AbortSignal, delayMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, delayMs)
    signal.addEventListener("abort", onAbort, { once: true })
  })

/** Retry one transient GET failure within the caller's existing timeout and cancellation. */
export async function fetchWithTransientRetry(url: string, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    signal.throwIfAborted()
    let retryDelayMs = RETRY_DELAY_MS
    try {
      const response = await fetch(url, { signal })
      if (attempt > 0 || !TRANSIENT_STATUSES.has(response.status)) return response
      const retryAfter = response.headers.get("Retry-After")
      if (retryAfter !== null && /^\d+$/u.test(retryAfter))
        retryDelayMs = Math.min(Number(retryAfter) * 1_000, MAX_RETRY_DELAY_MS)
      void response.body?.cancel().catch(() => undefined)
    } catch (error: unknown) {
      if (attempt > 0 || signal.aborted || !(error instanceof TypeError)) throw error
    }
    await waitForRetry(signal, retryDelayMs)
  }
}
