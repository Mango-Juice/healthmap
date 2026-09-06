import { vi } from "vitest"
import type { DiscoveryResultCache, MonotonicClock } from "../../lib/discovery/cache"
import type { DiscoveryRpcClient, DiscoveryState } from "../../lib/discovery/contracts"
import { DiscoveryDetailResponseSchema } from "../../lib/discovery/dto"
import { syntheticDiscoveryCatalog } from "../fixtures/discovery-catalog"

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
      id: syntheticDiscoveryCatalog.places[0]?.id,
      slug: syntheticDiscoveryCatalog.places[0]?.slug,
      name: syntheticDiscoveryCatalog.places[0]?.name,
      brandId: syntheticDiscoveryCatalog.places[0]?.brandId,
      address: syntheticDiscoveryCatalog.places[0]?.address,
      latitude: syntheticDiscoveryCatalog.places[0]?.latitude,
      longitude: syntheticDiscoveryCatalog.places[0]?.longitude,
      region: "서울 강남구",
      phone: syntheticDiscoveryCatalog.places[0]?.phone,
      naverPlaceUrl: syntheticDiscoveryCatalog.places[0]?.naverPlaceUrl,
      media: syntheticDiscoveryCatalog.places[0]?.media,
      listingKind: "menu_evidence",
      storeDescription: null,
      officialStoreUrl: null,
    },
    menus: syntheticDiscoveryCatalog.menus
      .filter((menu) => menu.placeId === syntheticDiscoveryCatalog.places[0]?.id)
      .map((menu) => ({
        id: menu.id,
        placeId: menu.placeId,
        name: menu.name,
        facts: {
          base_is_option: menu.facts.base_is_option,
          cooking: menu.facts.cooking,
          dietary: menu.facts.dietary,
          form: menu.facts.form,
          ingredients: menu.facts.ingredients,
          ordering_note: menu.facts.ordering_note,
          rice_base: menu.facts.rice_base,
          scope: menu.facts.scope,
          selection_reasons: menu.facts.selection_reasons,
        },
        branchApplicability: menu.branchApplicability,
        applicabilityNotice: null,
      })),
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
