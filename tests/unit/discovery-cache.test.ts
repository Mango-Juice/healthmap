import { afterEach, describe, expect, it, vi } from "vitest"
import { createCachedDiscoveryReader } from "../../lib/discovery/cache"
import { DiscoveryReadError } from "../../lib/discovery/contracts"
import { PilotQuerySchema } from "../../lib/pilot/query-contract"
import {
  detail,
  discoveryState,
  eligibleEpoch,
  emptyPlaces,
  RecordingCache,
  releaseId,
  rpcClient,
  TestClock,
} from "./discovery-cache-test-support"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("bounded discovery cache freshness", () => {
  it.each([
    { expectedStateReads: 1, time: 0 },
    { expectedStateReads: 1, time: 59_999 },
    { expectedStateReads: 2, time: 60_000 },
  ])(
    "Given a 60 second state, when monotonic time is $time, then state reads equal $expectedStateReads",
    async ({ expectedStateReads, time }) => {
      const clock = new TestClock()
      const cache = new RecordingCache()
      const client = rpcClient()
      const reader = createCachedDiscoveryReader(client, "provider-a", { cache, clock })

      await reader.query(PilotQuerySchema.parse({}))
      clock.milliseconds = time
      await reader.query(PilotQuerySchema.parse({}))

      expect(client.getState).toHaveBeenCalledTimes(expectedStateReads)
    },
  )

  it.each([
    { expectedStateReads: 1, time: 9 },
    { expectedStateReads: 2, time: 10 },
    { expectedStateReads: 2, time: 11 },
  ])(
    "Given a ten millisecond DB boundary, when reading at $time, then state reads equal $expectedStateReads",
    async ({ expectedStateReads, time }) => {
      const clock = new TestClock()
      const state = discoveryState({ nextBoundary: "2026-09-06T00:00:00.010000Z" })
      const client = rpcClient({
        getState: vi.fn().mockResolvedValue(state),
        query: vi.fn().mockResolvedValue({ ...state, data: emptyPlaces() }),
      })
      const reader = createCachedDiscoveryReader(client, "provider-a", {
        cache: new RecordingCache(),
        clock,
      })

      await reader.query(PilotQuerySchema.parse({}))
      clock.milliseconds = time
      await reader.query(PilotQuerySchema.parse({}))

      expect(client.getState).toHaveBeenCalledTimes(expectedStateReads)
    },
  )

  it.each(["2026-09-05T23:55:00Z", "2026-09-06T00:05:00Z"])(
    "Given state transit and wall-clock skew at %s, when checking freshness, then only monotonic time bounds it",
    async (wallTime) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(wallTime))
      const clock = new TestClock()
      const state = discoveryState({ nextBoundary: "2026-09-06T00:00:00.010000Z" })
      const getState = vi.fn().mockImplementation(async () => {
        clock.milliseconds += 6
        return state
      })
      const reader = createCachedDiscoveryReader(
        rpcClient({
          getState,
          query: vi.fn().mockResolvedValue({ ...state, data: emptyPlaces() }),
        }),
        "provider-a",
        { cache: new RecordingCache(), clock },
      )

      await reader.query(PilotQuerySchema.parse({}))
      clock.milliseconds = 10
      await reader.query(PilotQuerySchema.parse({}))

      expect(getState).toHaveBeenCalledTimes(2)
    },
  )

  it("Given a malformed origin envelope, when the validated load rejects, then no cache write occurs", async () => {
    const cache = new RecordingCache()
    const reader = createCachedDiscoveryReader(
      rpcClient({ query: vi.fn().mockResolvedValue({ data: [] }) }),
      "provider-a",
      { cache, clock: new TestClock() },
    )

    await expect(reader.query(PilotQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "invalid_response",
    })
    expect(cache.writes).toBe(0)
  })

  it("Given a stale SWR envelope and failed refresh, when queried, then old data is not returned", async () => {
    const current = discoveryState()
    const stale = discoveryState({ eligibleEpoch: "b".repeat(64), releaseId: "old-release" })
    const getState = vi
      .fn()
      .mockResolvedValueOnce(current)
      .mockRejectedValueOnce(new DiscoveryReadError("transport"))
    const cache = {
      read: vi.fn().mockResolvedValue({ ...stale, data: emptyPlaces("old-release") }),
    }
    const reader = createCachedDiscoveryReader(rpcClient({ getState }), "provider-a", {
      cache,
      clock: new TestClock(),
    })

    await expect(reader.query(PilotQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "transport",
    })
  })

  it("Given sensitive query coordinates, when cached, then keys contain only digests and state identifiers", async () => {
    const cache = new RecordingCache()
    const reader = createCachedDiscoveryReader(rpcClient(), "provider-a", {
      cache,
      clock: new TestClock(),
    })

    await reader.query(
      PilotQuerySchema.parse({ query: "비공개 검색", south: 37, north: 38, west: 126, east: 127 }),
    )

    expect(cache.keys).toHaveLength(1)
    expect(cache.keys[0]).not.toContain("비공개 검색")
    expect(cache.keys[0]).not.toContain("37")
    expect(cache.keys[0]).toContain(releaseId)
    expect(cache.keys[0]).toContain(eligibleEpoch)
  })

  it("Given each canonical query field changes, when cached, then every request has a distinct key", async () => {
    const cache = new RecordingCache()
    const client = rpcClient({
      query: vi.fn().mockImplementation((request) =>
        Promise.resolve({
          ...discoveryState(),
          data:
            request.mode === "regions"
              ? { catalogVersion: releaseId, regions: [], total: 0 }
              : emptyPlaces(),
        }),
      ),
    })
    const reader = createCachedDiscoveryReader(client, "provider-a", {
      cache,
      clock: new TestClock(),
    })
    const requests = [
      {},
      { query: "term" },
      { filter: "salad_poke" },
      { ingredient: "chicken" },
      { region: "서울 강남구" },
      { south: 37, north: 38, west: 126, east: 127 },
      { limit: 25 },
      { cursor: "valid_cursor" },
      { mode: "regions" },
    ] as const

    for (const request of requests) await reader.query(PilotQuerySchema.parse(request))

    expect(new Set(cache.keys).size).toBe(requests.length)
  })
})

describe("bounded discovery detail cache", () => {
  it("Given a malformed detail envelope, when loaded, then it is rejected before a cache write", async () => {
    const cache = new RecordingCache()
    const reader = createCachedDiscoveryReader(
      rpcClient({ getPlace: vi.fn().mockResolvedValue({ ...discoveryState(), data: {} }) }),
      "provider-a",
      { cache, clock: new TestClock() },
    )

    await expect(reader.getPlace(detail().place.id)).rejects.toMatchObject({
      kind: "invalid_response",
    })
    expect(cache.writes).toBe(0)
  })

  it("Given detail state changes, when origin reports stale state, then one fresh no-store retry returns only the new detail", async () => {
    const next = discoveryState({ eligibleEpoch: "c".repeat(64), releaseId: "new-release" })
    const getState = vi.fn().mockResolvedValueOnce(discoveryState()).mockResolvedValueOnce(next)
    const getPlace = vi
      .fn()
      .mockRejectedValueOnce(new DiscoveryReadError("stale_state"))
      .mockResolvedValueOnce({ ...next, data: detail("new-release") })
    const reader = createCachedDiscoveryReader(rpcClient({ getPlace, getState }), "provider-a", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })

    await expect(reader.getPlace(detail().place.id)).resolves.toMatchObject({
      catalogVersion: "new-release",
    })
    expect(getPlace).toHaveBeenCalledTimes(2)
    expect(getState).toHaveBeenCalledTimes(2)
  })

  it("Given detail loading crosses its hard boundary, when it completes, then a fresh direct retry replaces it", async () => {
    const clock = new TestClock()
    const old = discoveryState({ nextBoundary: "2026-09-06T00:00:00.010000Z" })
    const next = discoveryState({ eligibleEpoch: "e".repeat(64), releaseId: "new-release" })
    const getState = vi.fn().mockResolvedValueOnce(old).mockResolvedValueOnce(next)
    const getPlace = vi
      .fn()
      .mockImplementationOnce(async () => {
        clock.milliseconds = 10
        return { ...old, data: detail() }
      })
      .mockResolvedValueOnce({ ...next, data: detail("new-release") })
    const reader = createCachedDiscoveryReader(rpcClient({ getPlace, getState }), "provider-a", {
      cache: new RecordingCache(),
      clock,
    })

    await expect(reader.getPlace(detail().place.id)).resolves.toMatchObject({
      catalogVersion: "new-release",
    })
    expect(getPlace).toHaveBeenCalledTimes(2)
  })
})
