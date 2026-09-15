import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createCachedDiscoveryReader,
  passthroughDiscoveryResultCache,
} from "../../lib/discovery/cache"
import { DiscoveryQuerySchema } from "../../lib/discovery/query-contract"
import { createSupabaseDiscoveryRpcClient } from "../../lib/discovery/server"
import { discoveryState, emptyPlaces } from "./discovery-cache-test-support"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const useTimeoutClock = () => {
  vi.useFakeTimers()
  vi.spyOn(AbortSignal, "timeout").mockImplementation((duration) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), duration)
    return controller.signal
  })
}

const delayedFetch = (stateDelay: number, dataDelay: number): typeof fetch =>
  vi.fn().mockImplementation((url: URL, options: RequestInit) => {
    const stateRequest = url.pathname.endsWith("get_discovery_state")
    const delay = stateRequest ? stateDelay : dataDelay
    return new Promise<Response>((resolve, reject) => {
      const signal = options.signal
      const abort = () => {
        clearTimeout(timer)
        reject(signal?.reason)
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort)
        resolve(
          Response.json(
            stateRequest ? discoveryState() : { ...discoveryState(), data: emptyPlaces() },
          ),
        )
      }, delay)
      signal?.addEventListener("abort", abort, { once: true })
    })
  })

const readerFor = (fetchImplementation: typeof fetch) =>
  createCachedDiscoveryReader(
    createSupabaseDiscoveryRpcClient(
      { key: "synthetic-key", url: "https://db.test" },
      fetchImplementation,
    ),
    "synthetic-provider",
    { cache: passthroughDiscoveryResultCache },
  )

describe("cold discovery request budget", () => {
  it("allows a cold state read above the old 1.5 second limit and a cold data read", async () => {
    useTimeoutClock()
    const fetchImplementation = delayedFetch(2_000, 2_700)
    const pending = readerFor(fetchImplementation).query(DiscoveryQuerySchema.parse({}))

    await vi.advanceTimersByTimeAsync(4_700)

    await expect(pending).resolves.toMatchObject({ total: 0 })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it("classifies a shared state deadline as timeout and allows the next request to recover", async () => {
    useTimeoutClock()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const fetchImplementation = delayedFetch(3_100, 0)
    const reader = readerFor(fetchImplementation)
    const failed = expect(reader.query(DiscoveryQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "timeout",
    })
    await vi.advanceTimersByTimeAsync(3_000)
    await failed

    vi.mocked(fetchImplementation).mockImplementation(delayedFetch(100, 100))
    const recovered = reader.query(DiscoveryQuerySchema.parse({}))
    await vi.advanceTimersByTimeAsync(200)
    await expect(recovered).resolves.toMatchObject({ total: 0 })
  })

  it("bounds even a cache read that never settles by the whole request deadline", async () => {
    useTimeoutClock()
    const rpc = createSupabaseDiscoveryRpcClient(
      { key: "synthetic-key", url: "https://db.test" },
      delayedFetch(100, 100),
    )
    const reader = createCachedDiscoveryReader(rpc, "synthetic-provider", {
      cache: { read: () => new Promise(() => undefined) },
    })
    const failed = expect(reader.query(DiscoveryQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "timeout",
    })
    await vi.advanceTimersByTimeAsync(6_500)
    await failed
  })
})
