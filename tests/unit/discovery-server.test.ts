import { afterEach, describe, expect, it, vi } from "vitest"
import { DiscoveryQuerySchema } from "../../lib/discovery/query-contract"
import {
  createDiscoveryReader,
  createDiscoveryRuntimeReader,
  createSupabaseDiscoveryRpcClient,
  DiscoveryReadError,
  type DiscoveryRpcClient,
} from "../../lib/discovery/server"

const releaseId = "pilot-test-release"
const eligibleEpoch = "a".repeat(64)
const state = {
  schemaVersion: "discovery-serving-1",
  releaseId,
  eligibleEpoch,
  evaluatedAt: "2026-09-05T23:17:45.000000Z",
  nextBoundary: null,
} as const
const emptyPlaces = {
  catalogVersion: releaseId,
  sortBasis: "catalog_center",
  sortOrigin: null,
  total: 0,
  results: [],
  nextCursor: null,
} as const

const client = (overrides: Partial<DiscoveryRpcClient> = {}): DiscoveryRpcClient => ({
  getState: vi.fn().mockResolvedValue(state),
  query: vi.fn().mockResolvedValue({ ...state, data: emptyPlaces }),
  getPlace: vi.fn().mockResolvedValue({ ...state, data: null }),
  ...overrides,
})

afterEach(() => vi.restoreAllMocks())

describe("bounded discovery reader", () => {
  it("Given a public endpoint, when querying, then it sends a canonical no-store RPC request", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ ...state, data: emptyPlaces }))
    const reader = createDiscoveryReader(
      createSupabaseDiscoveryRpcClient({ key: "publishable-test-key", url: "https://db.test" }),
    )

    await reader.query(DiscoveryQuerySchema.parse({ query: "  Ａ  B  " }))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const request = fetchSpy.mock.calls[0]
    expect(String(request?.[0])).toBe("https://db.test/rest/v1/rpc/query_discovery")
    expect(request?.[1]).toMatchObject({
      cache: "no-store",
      headers: {
        apikey: "publishable-test-key",
        authorization: "Bearer publishable-test-key",
        "content-type": "application/json",
      },
      method: "POST",
    })
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      p_request: {
        filter: "all",
        ingredient: "all",
        limit: 50,
        mode: "places",
        query: "a b",
      },
    })
  })

  it("Given a malformed successful payload, when read, then it fails as invalid response", async () => {
    const reader = createDiscoveryReader(client({ query: vi.fn().mockResolvedValue({ data: [] }) }))

    await expect(reader.query(DiscoveryQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "invalid_response",
    })
  })

  it("Given a mismatched catalog version, when read, then it rejects the stale envelope", async () => {
    const reader = createDiscoveryReader(
      client({
        query: vi
          .fn()
          .mockResolvedValue({ ...state, data: { ...emptyPlaces, catalogVersion: "other" } }),
      }),
    )

    await expect(reader.query(DiscoveryQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "invalid_response",
    })
  })

  it("Given missing public configuration, when creating the runtime reader, then it fails explicitly", () => {
    expect(() => createDiscoveryRuntimeReader({})).toThrowError(
      expect.objectContaining({ kind: "configuration" }),
    )
  })

  it("Given no active release, when querying, then it returns a legitimate empty result", async () => {
    const emptyState = { ...state, eligibleEpoch: "b".repeat(64), releaseId: null }
    const reader = createDiscoveryReader(
      client({
        getState: vi.fn().mockResolvedValue(emptyState),
        query: vi.fn().mockResolvedValue({
          ...emptyState,
          data: { ...emptyPlaces, catalogVersion: "empty" },
        }),
      }),
    )

    await expect(reader.query(DiscoveryQuerySchema.parse({}))).resolves.toMatchObject({
      catalogVersion: "empty",
      results: [],
      total: 0,
    })
  })

  it("Given state changes between calls, when querying, then it refreshes and retries once", async () => {
    const freshState = { ...state, eligibleEpoch: "c".repeat(64), releaseId: "pilot-fresh" }
    const query = vi
      .fn()
      .mockRejectedValueOnce(new DiscoveryReadError("stale_state"))
      .mockResolvedValueOnce({
        ...freshState,
        data: { ...emptyPlaces, catalogVersion: freshState.releaseId },
      })
    const getState = vi.fn().mockResolvedValueOnce(freshState)
    const reader = createDiscoveryReader(client({ getState, query }))

    await expect(reader.query(DiscoveryQuerySchema.parse({}))).resolves.toMatchObject({
      catalogVersion: "pilot-fresh",
    })
    expect(getState).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it("Given a stale cursor, when querying, then it remains a typed conflict", async () => {
    const reader = createDiscoveryReader(
      client({ query: vi.fn().mockRejectedValue(new DiscoveryReadError("stale_cursor")) }),
    )

    await expect(
      reader.query(DiscoveryQuerySchema.parse({ cursor: "valid_cursor" })),
    ).rejects.toMatchObject({ kind: "stale_cursor" })
  })

  it.each([
    { code: "PT400", error: "invalid_request", expected: "invalid_request", status: 400 },
    { code: "PT409", error: "stale_state", expected: "stale_state", status: 409 },
  ] as const)(
    "Given a real $code response, when the RPC adapter reads it, then it returns $expected",
    async ({ code, error, expected, status }) => {
      const fetchImplementation = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code, message: JSON.stringify({ error, retry: code === "PT409" }) },
            { status },
          ),
        )
      const rpc = createSupabaseDiscoveryRpcClient(
        { key: "publishable-test-key", url: "https://db.test" },
        fetchImplementation,
      )

      await expect(
        rpc.query({
          expectedRelease: releaseId,
          expectedEpoch: eligibleEpoch,
          mode: "places",
          query: "",
          filter: "all",
          ingredient: "all",
          limit: 50,
        }),
      ).rejects.toMatchObject({ kind: expected })
    },
  )

  it("Given the RPC times out, when reading state, then it reports a typed timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    const reader = createDiscoveryReader(
      createSupabaseDiscoveryRpcClient({ key: "publishable-test-key", url: "https://db.test" }),
    )

    await expect(reader.query(DiscoveryQuerySchema.parse({}))).rejects.toMatchObject({
      kind: "timeout",
    })
  })

  it("Given caller cancellation, when reading state, then it reports cancellation", async () => {
    const controller = new AbortController()
    controller.abort()
    const reader = createDiscoveryReader(client())

    await expect(
      reader.query(DiscoveryQuerySchema.parse({}), controller.signal),
    ).rejects.toMatchObject({
      kind: "cancelled",
    })
  })
})
