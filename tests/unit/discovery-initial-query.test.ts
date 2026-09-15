import { describe, expect, it, vi } from "vitest"
import { createCachedDiscoveryReader } from "../../lib/discovery/cache"
import { DiscoveryReadError } from "../../lib/discovery/contracts"
import { DiscoveryQuerySchema } from "../../lib/discovery/query-contract"
import {
  deferred,
  detail,
  discoveryState,
  emptyPlaces,
  RecordingCache,
  rpcClient,
  TestClock,
} from "./discovery-cache-test-support"

describe("initial discovery query", () => {
  it.each(["places", "regions"] as const)(
    "fetches cold %s once, primes the cache, and binds later queries to the returned state",
    async (mode) => {
      const state = discoveryState()
      const data =
        mode === "places"
          ? emptyPlaces()
          : { catalogVersion: state.releaseId, total: 0, regions: [] }
      const query = vi.fn().mockResolvedValue({ ...state, data })
      const client = rpcClient({ query })
      const cache = new RecordingCache()
      const reader = createCachedDiscoveryReader(client, "provider", {
        cache,
        clock: new TestClock(),
      })

      const input = DiscoveryQuerySchema.parse({ mode })
      await expect(reader.query(input)).resolves.toEqual(data)
      await expect(reader.query(input)).resolves.toEqual(data)
      expect(query).toHaveBeenCalledTimes(1)
      expect(query.mock.calls[0]?.[0]).not.toHaveProperty("expectedRelease")
      expect(query.mock.calls[0]?.[0]).not.toHaveProperty("expectedEpoch")
      expect(cache.writes).toBe(1)
      expect(client.getState).not.toHaveBeenCalled()

      await reader.query(DiscoveryQuerySchema.parse({ mode, query: "another" }))
      expect(query).toHaveBeenCalledTimes(2)
      expect(query.mock.calls[1]?.[0]).toMatchObject({
        expectedRelease: state.releaseId,
        expectedEpoch: state.eligibleEpoch,
        query: "another",
      })
    },
  )

  it("shares cold state across different queries without mixing their results", async () => {
    const state = discoveryState()
    const pending = deferred<unknown>()
    const regions = { catalogVersion: state.releaseId, total: 0, regions: [] }
    const query = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...state, data: regions })
    const client = rpcClient({ query })
    const reader = createCachedDiscoveryReader(client, "provider", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })

    const places = reader.query(DiscoveryQuerySchema.parse({}))
    const regionResults = reader.query(DiscoveryQuerySchema.parse({ mode: "regions" }))
    pending.resolve({ ...state, data: emptyPlaces() })

    await expect(places).resolves.toEqual(emptyPlaces())
    await expect(regionResults).resolves.toEqual(regions)
    expect(client.getState).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1]?.[0]).toMatchObject({
      expectedRelease: state.releaseId,
      expectedEpoch: state.eligibleEpoch,
      mode: "regions",
    })
  })

  it("rejects an initial response that expires in transit and returns only a fresh retry", async () => {
    const clock = new TestClock()
    const old = discoveryState({ nextBoundary: "2026-09-06T00:00:00.010000Z" })
    const current = discoveryState({ releaseId: "fresh-release", eligibleEpoch: "f".repeat(64) })
    const query = vi
      .fn()
      .mockImplementationOnce(async () => {
        clock.milliseconds = 10
        return { ...old, data: emptyPlaces() }
      })
      .mockResolvedValueOnce({ ...current, data: emptyPlaces("fresh-release") })
    const client = rpcClient({ query, getState: vi.fn().mockResolvedValue(current) })
    const cache = new RecordingCache()
    const reader = createCachedDiscoveryReader(client, "provider", { cache, clock })

    await expect(reader.query(DiscoveryQuerySchema.parse({}))).resolves.toMatchObject({
      catalogVersion: "fresh-release",
    })
    expect(query).toHaveBeenCalledTimes(2)
    expect(client.getState).toHaveBeenCalledTimes(1)
    expect(cache.writes).toBe(0)
  })

  it.each(["stale_cursor", "invalid_request", "invalid_response"] as const)(
    "isolates an initial query's %s from concurrent valid queries and details",
    async (kind) => {
      const pending = deferred<unknown>()
      const client = rpcClient({
        query: vi
          .fn()
          .mockReturnValueOnce(pending.promise)
          .mockImplementation((request) =>
            request.cursor
              ? Promise.reject(new DiscoveryReadError(kind))
              : Promise.resolve({ ...discoveryState(), data: emptyPlaces() }),
          ),
      })
      const reader = createCachedDiscoveryReader(client, "provider", {
        cache: new RecordingCache(),
        clock: new TestClock(),
      })
      const failed = expect(
        reader.query(DiscoveryQuerySchema.parse({ cursor: "stale_cursor" })),
      ).rejects.toMatchObject({ kind })
      const validQuery = reader.query(DiscoveryQuerySchema.parse({}))
      const validDetail = reader.getPlace(detail().place.id)
      pending.reject(new DiscoveryReadError(kind))

      await failed
      await expect(Promise.all([validQuery, validDetail])).resolves.toEqual([
        emptyPlaces(),
        detail(),
      ])
      expect(client.getState).toHaveBeenCalledTimes(1)
      expect(client.query).toHaveBeenCalledTimes(kind === "invalid_request" ? 3 : 2)
      expect(client.getPlace).toHaveBeenCalledTimes(1)
    },
  )

  it("does not retain state or cache data from a malformed initial envelope", async () => {
    const state = discoveryState()
    const query = vi
      .fn()
      .mockResolvedValueOnce({ ...state, data: emptyPlaces("wrong-release") })
      .mockResolvedValueOnce({ ...state, data: emptyPlaces() })
    const client = rpcClient({ query })
    const cache = new RecordingCache()
    const reader = createCachedDiscoveryReader(client, "provider", {
      cache,
      clock: new TestClock(),
    })

    await expect(reader.query(DiscoveryQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "invalid_response",
    })
    expect(cache.writes).toBe(0)
    await expect(reader.query(DiscoveryQuerySchema.parse({}))).resolves.toEqual(emptyPlaces())
    expect(query.mock.calls[1]?.[0]).not.toHaveProperty("expectedEpoch")
    expect(client.getState).not.toHaveBeenCalled()
  })
})
