import { afterEach, describe, expect, it, vi } from "vitest"
import { createCachedDiscoveryReader } from "../../lib/discovery/cache"
import { DiscoveryReadError } from "../../lib/discovery/contracts"
import { DiscoveryQuerySchema } from "../../lib/discovery/query-contract"
import { createSupabaseDiscoveryRpcClient } from "../../lib/discovery/server"
import {
  discoveryState,
  emptyPlaces,
  RecordingCache,
  rpcClient,
  TestClock,
} from "./discovery-cache-test-support"

afterEach(() => vi.restoreAllMocks())

describe("discovery database rollout compatibility", () => {
  it("recovers a legacy RPC's real HTTP 400 through explicit state and caches the result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const state = discoveryState()
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: "PT400", message: '{"error":"invalid_request","retry":false}' },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(Response.json(state))
      .mockResolvedValueOnce(Response.json({ ...state, data: emptyPlaces() }))
    const reader = createCachedDiscoveryReader(
      createSupabaseDiscoveryRpcClient(
        { key: "synthetic-key", url: "https://db.test" },
        fetchImplementation,
      ),
      "provider",
      { cache: new RecordingCache(), clock: new TestClock() },
    )

    const input = DiscoveryQuerySchema.parse({})
    await expect(reader.query(input)).resolves.toEqual(emptyPlaces())
    await expect(reader.query(input)).resolves.toEqual(emptyPlaces())
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
    expect(fetchImplementation.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/rest/v1/rpc/query_discovery",
      "/rest/v1/rpc/get_discovery_state",
      "/rest/v1/rpc/query_discovery",
    ])
    expect(JSON.parse(fetchImplementation.mock.calls[2]?.[1].body).p_request).toMatchObject({
      expectedRelease: state.releaseId,
      expectedEpoch: state.eligibleEpoch,
    })
  })

  it("recovers simultaneous identical queries when the initial protocol is unsupported", async () => {
    const state = discoveryState()
    const client = rpcClient({
      query: vi
        .fn()
        .mockImplementation((request) =>
          request.expectedEpoch === undefined
            ? Promise.reject(new DiscoveryReadError("invalid_request"))
            : Promise.resolve({ ...state, data: emptyPlaces() }),
        ),
    })
    const reader = createCachedDiscoveryReader(client, "provider", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })

    const input = DiscoveryQuerySchema.parse({})
    await expect(Promise.all([reader.query(input), reader.query(input)])).resolves.toEqual([
      emptyPlaces(),
      emptyPlaces(),
    ])
    expect(client.getState).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(client.query).mock.calls.filter(([request]) => request.expectedEpoch === undefined),
    ).toHaveLength(1)
  })

  it("still rejects a bad explicit query after one compatibility fallback", async () => {
    const client = rpcClient({
      query: vi.fn().mockRejectedValue(new DiscoveryReadError("invalid_request")),
    })
    const reader = createCachedDiscoveryReader(client, "provider", {
      cache: new RecordingCache(),
      clock: new TestClock(),
    })

    await expect(reader.query(DiscoveryQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "invalid_request",
    })
    expect(client.query).toHaveBeenCalledTimes(2)
    expect(client.getState).toHaveBeenCalledTimes(1)
  })
})
