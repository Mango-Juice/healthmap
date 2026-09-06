import { describe, expect, it, vi } from "vitest"
import { createCachedDiscoveryReader } from "../../lib/discovery/cache"
import { DiscoveryReadError } from "../../lib/discovery/contracts"
import { DiscoveryQuerySchema } from "../../lib/discovery/query-contract"
import {
  deferred,
  discoveryState,
  emptyPlaces,
  RecordingCache,
  rpcClient,
  TestClock,
} from "./discovery-cache-test-support"

describe("discovery state singleflight", () => {
  it("Given two cold callers, when state resolves, then one state RPC supplies both", async () => {
    const pending = deferred<ReturnType<typeof discoveryState>>()
    const getState = vi.fn().mockReturnValue(pending.promise)
    const reader = createCachedDiscoveryReader(rpcClient({ getState }), "provider-a", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })

    const first = reader.query(DiscoveryQuerySchema.parse({ query: "first" }))
    const second = reader.query(DiscoveryQuerySchema.parse({ query: "second" }))
    pending.resolve(discoveryState())

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(getState).toHaveBeenCalledTimes(1)
  })

  it("Given one caller aborts during shared refresh, when state resolves, then its peer still succeeds", async () => {
    const pending = deferred<ReturnType<typeof discoveryState>>()
    const getState = vi.fn().mockReturnValue(pending.promise)
    const reader = createCachedDiscoveryReader(rpcClient({ getState }), "provider-a", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })
    const controller = new AbortController()

    const cancelled = reader.query(
      DiscoveryQuerySchema.parse({ query: "cancel" }),
      controller.signal,
    )
    const survivor = reader.query(DiscoveryQuerySchema.parse({ query: "survive" }))
    controller.abort()
    pending.resolve(discoveryState())

    await expect(cancelled).rejects.toMatchObject({ kind: "cancelled" })
    await expect(survivor).resolves.toMatchObject({ catalogVersion: "synthetic-release-a" })
    expect(getState).toHaveBeenCalledTimes(1)
  })

  it("Given a release switches during concurrent reads, when stale calls retry, then no old page returns", async () => {
    const oldState = discoveryState()
    const newState = discoveryState({ eligibleEpoch: "d".repeat(64), releaseId: "new-release" })
    const getState = vi.fn().mockResolvedValueOnce(oldState).mockResolvedValue(newState)
    const query = vi
      .fn()
      .mockRejectedValueOnce(new DiscoveryReadError("stale_state"))
      .mockResolvedValue({ ...newState, data: emptyPlaces("new-release") })
    const reader = createCachedDiscoveryReader(rpcClient({ getState, query }), "provider-a", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })

    const first = reader.query(DiscoveryQuerySchema.parse({ query: "page one" }))
    const second = reader.query(DiscoveryQuerySchema.parse({ query: "page two" }))

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ catalogVersion: "new-release" }),
      expect.objectContaining({ catalogVersion: "new-release" }),
    ])
  })
})
