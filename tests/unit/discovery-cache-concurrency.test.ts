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
  it("Given identical cold callers, when the initial query resolves, then one RPC supplies both", async () => {
    const pending = deferred<unknown>()
    const client = rpcClient({ query: vi.fn().mockReturnValue(pending.promise) })
    const reader = createCachedDiscoveryReader(client, "provider-a", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })

    const first = reader.query(DiscoveryQuerySchema.parse({ query: "same" }))
    const second = reader.query(DiscoveryQuerySchema.parse({ query: "same" }))
    pending.resolve({ ...discoveryState(), data: emptyPlaces() })

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(client.getState).not.toHaveBeenCalled()
    expect(client.query).toHaveBeenCalledTimes(1)
  })

  it("Given one caller aborts during shared refresh, when state resolves, then its peer still succeeds", async () => {
    const pending = deferred<unknown>()
    const client = rpcClient({ query: vi.fn().mockReturnValue(pending.promise) })
    const reader = createCachedDiscoveryReader(client, "provider-a", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })
    const controller = new AbortController()

    const cancelled = reader.query(DiscoveryQuerySchema.parse({ query: "same" }), controller.signal)
    const survivor = reader.query(DiscoveryQuerySchema.parse({ query: "same" }))
    controller.abort()
    pending.resolve({ ...discoveryState(), data: emptyPlaces() })

    await expect(cancelled).rejects.toMatchObject({ kind: "cancelled" })
    await expect(survivor).resolves.toMatchObject({ catalogVersion: "synthetic-release-a" })
    expect(client.getState).not.toHaveBeenCalled()
    expect(client.query).toHaveBeenCalledTimes(1)
  })

  it("Given a release switches during concurrent reads, when stale calls retry, then no old page returns", async () => {
    const newState = discoveryState({ eligibleEpoch: "d".repeat(64), releaseId: "new-release" })
    const getState = vi.fn().mockResolvedValue(newState)
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
