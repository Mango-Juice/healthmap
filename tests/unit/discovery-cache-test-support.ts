import { vi } from "vitest"
import type { DiscoveryResultCache, MonotonicClock } from "../../lib/discovery/cache"
import type { DiscoveryRpcClient, DiscoveryState } from "../../lib/discovery/contracts"
import { DiscoveryDetailResponseSchema } from "../../lib/discovery/dto"

export const releaseId = "synthetic-release-a"
export const eligibleEpoch = "a".repeat(64)

export const discoveryState = (overrides: Partial<DiscoveryState> = {}): DiscoveryState => ({
  schemaVersion: "discovery-serving-1",
  releaseId,
  eligibleEpoch,
  evaluatedAt: "2026-09-06T00:00:00.000000Z",
  nextBoundary: null,
  ...overrides,
})

export const emptyPlaces = (catalogVersion: string = releaseId) => ({
  catalogVersion,
  sortBasis: "catalog_center" as const,
  sortOrigin: null,
  total: 0,
  results: [],
  nextCursor: null,
})

export const detail = (catalogVersion: string = releaseId) =>
  DiscoveryDetailResponseSchema.parse({
    catalogVersion,
    place: {
      id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01",
      slug: "cache-test-place",
      name: "캐시 테스트 식당",
      brandId: null,
      address: "서울 강남구 테스트로 1",
      latitude: 37.5,
      longitude: 127.03,
      region: "서울 강남구",
      phone: null,
      naverPlaceUrl: "https://map.naver.com/p/entry/place/1",
      media: [],
      listingKind: "menu_evidence",
      storeDescription: null,
      officialStoreUrl: null,
    },
    menus: [
      {
        id: "bc6b1050-539e-4d28-8493-5920eae54201",
        placeId: "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01",
        name: "캐시 테스트 메뉴",
        facts: {
          base_is_option: false,
          cooking: [],
          dietary: "unknown",
          form: "salad_poke",
          ingredients: [],
          ordering_note: null,
          rice_base: "unknown",
          scope: "meal",
          selection_reasons: [{ basis: "menu_name", kind: "salad_poke", text: "캐시 테스트 메뉴" }],
        },
        branchApplicability: "branch_confirmed",
        applicabilityNotice: null,
      },
    ],
  })

export class TestClock implements MonotonicClock {
  milliseconds = 0

  now = (): number => this.milliseconds
}

export class RecordingCache implements DiscoveryResultCache {
  readonly entries = new Map<string, unknown>()
  readonly keys: string[] = []
  writes = 0

  async read(key: string, load: () => Promise<unknown>): Promise<unknown> {
    this.keys.push(key)
    if (this.entries.has(key)) return this.entries.get(key)
    const value = await load()
    this.entries.set(key, value)
    this.writes += 1
    return value
  }
}

export const rpcClient = (overrides: Partial<DiscoveryRpcClient> = {}): DiscoveryRpcClient => ({
  getState: vi.fn().mockResolvedValue(discoveryState()),
  query: vi.fn().mockResolvedValue({ ...discoveryState(), data: emptyPlaces() }),
  getPlace: vi.fn().mockResolvedValue({ ...discoveryState(), data: detail() }),
  ...overrides,
})

export const deferred = <Value>() => {
  let resolvePromise: (value: Value) => void = () => undefined
  let rejectPromise: (reason: unknown) => void = () => undefined
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, reject: rejectPromise, resolve: resolvePromise }
}
