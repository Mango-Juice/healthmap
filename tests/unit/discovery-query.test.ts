import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildDiscoveryRegionRequestUrl } from "../../components/food-map/use-food-map-query"
import { parseDiscoveryQuery } from "../../lib/discovery/query-contract"

describe("Discovery query boundary", () => {
  it("rejects partial, inverted, nonfinite and unknown bounds", () => {
    for (const query of [
      "south=1",
      "south=38&north=37&west=127&east=128",
      "south=NaN&north=38&west=127&east=128",
      "limit=101",
      "surprise=1",
      "query=a&query=b",
    ]) {
      expect(parseDiscoveryQuery(new URLSearchParams(query)).success).toBe(false)
    }
  })
  it("defaults to fifty bounded places", () => {
    const result = parseDiscoveryQuery(new URLSearchParams())
    expect(result.success && result.data.limit).toBe(50)
  })
})

describe("Discovery region request", () => {
  it("includes only the current text and menu conditions", () => {
    const url = new URL(
      buildDiscoveryRegionRequestUrl({
        query: "  샐러드  ",
        filter: "plant_based",
        ingredient: "tofu_soy",
      }),
      "https://healthmap.test",
    )

    expect(url.searchParams.get("mode")).toBe("regions")
    expect(url.searchParams.get("query")).toBe("  샐러드  ")
    expect(url.searchParams.get("filter")).toBe("plant_based")
    expect(url.searchParams.get("ingredient")).toBe("tofu_soy")
    for (const excluded of ["region", "south", "west", "north", "east", "cursor"])
      expect(url.searchParams.has(excluded)).toBe(false)
  })
})

describe("Discovery detail copy", () => {
  it("labels matching menus without asserting branch sale", () => {
    const source = readFileSync(
      new URL("../../components/food-map/food-map-detail.tsx", import.meta.url),
      "utf8",
    )

    expect(source).toContain('title="조건에 맞는 메뉴"')
    expect(source).toContain('title="함께 살펴볼 메뉴"')
    expect(source).not.toContain('title="여기서 먹을 수 있어요"')
  })
})

import {
  currentDiscoveryCatalog,
  type DiscoveryCatalog,
  DiscoveryCatalogSchema,
  DiscoveryMenuSchema,
} from "../../lib/discovery/catalog"
import {
  DiscoveryPlacesResponseSchema,
  DiscoveryRegionsResponseSchema,
} from "../../lib/discovery/dto"
import { hasDiscoveryMealSelectionBasis } from "../../lib/discovery/menu-selection"
import { queryDiscoveryCatalog } from "../../lib/discovery/query"
import { DiscoveryQuerySchema } from "../../lib/discovery/query-contract"
import { type SubwayStore, SubwayStoreSchema } from "../../lib/discovery/subway"
import { syntheticDiscoveryCatalog } from "../fixtures/discovery-catalog"

const catalog = syntheticDiscoveryCatalog
const selectedMenu = catalog.menus.find((menu) => hasDiscoveryMealSelectionBasis(menu))
const selectedPlace = selectedMenu
  ? catalog.places.find((place) => place.id === selectedMenu.placeId)
  : undefined
if (!selectedMenu || !selectedPlace) throw new Error("missing selected synthetic fixture base")

const syntheticCatalog = (
  entries: readonly {
    readonly id: string
    readonly menuId: string
    readonly placeName: string
    readonly menuName: string
    readonly address?: string
    readonly latitude: number
    readonly longitude: number
  }[],
): DiscoveryCatalog =>
  DiscoveryCatalogSchema.parse({
    ...catalog,
    catalogVersion: "pilot-20260905-aaaaaaaaaaaa",
    places: entries.map((entry) => ({
      ...selectedPlace,
      id: entry.id,
      slug: `place-${entry.id.slice(0, 8)}`,
      name: entry.placeName,
      address: entry.address ?? "서울특별시 중구 테스트로 1",
      latitude: entry.latitude,
      longitude: entry.longitude,
    })),
    menus: entries.map((entry) => ({
      ...selectedMenu,
      id: entry.menuId,
      placeId: entry.id,
      name: entry.menuName,
    })),
  })

const orderingCatalog = syntheticCatalog([
  {
    id: "55005f59-f094-4b30-8e8a-447b1607da04",
    menuId: "75708968-2839-4eba-8b44-f613de821d04",
    placeName: "토큰 분산 식당",
    menuName: "샐러드 메뉴",
    address: "서울 특별 거리",
    latitude: 0,
    longitude: 0.01,
  },
  {
    id: "17d03b81-1376-42ad-8031-14b559f3c003",
    menuId: "c4e1cffb-2658-4ad4-8e38-c8c12a11c603",
    placeName: "메뉴 일치 식당",
    menuName: "오늘의 샐러드 특별",
    latitude: 0,
    longitude: 0.02,
  },
  {
    id: "970347d1-7b9f-4b7d-8cd9-3674148c0e02",
    menuId: "bede62e8-6e4d-4d3b-8227-34b73451b302",
    placeName: "우리 샐러드 특별 집",
    menuName: "한 끼",
    latitude: 0,
    longitude: 0.03,
  },
  {
    id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01",
    menuId: "bc6b1050-539e-4d28-8493-5920eae54201",
    placeName: "샐러드　특별",
    menuName: "한 끼",
    latitude: 0,
    longitude: 0.04,
  },
])
const places = (search: string) => {
  const query = parseDiscoveryQuery(new URLSearchParams(search))
  if (!query.success) throw new Error("invalid test query")
  return queryDiscoveryCatalog(catalog, query.data)
}
const subwayCatalog = (stores: readonly SubwayStore[]) => ({
  version: "subway-test-snapshot",
  stores,
})
describe("server Discovery projection", () => {
  it("includes menu-free Subway locations only in browse and salad discovery", () => {
    // Given one store-only location beside the menu-backed catalog.
    const store = SubwayStoreSchema.parse({
      id: "20000000-0000-5000-8000-000000000001",
      slug: "subway-1",
      officialStoreId: "1",
      brandId: "subway",
      brandName: "서브웨이",
      name: "서브웨이 테스트점",
      address: "부산광역시 해운대구 테스트로 1",
      latitude: 35.16,
      longitude: 129.16,
      officialDetailUrl: "https://www.subway.co.kr/storeDetail?franchiseNo=1",
      officialListingUrl: "https://subway.co.kr/storeSearch",
      observedAt: "2026-09-05T00:00:00.000Z",
    })

    // When browse, salad discovery, its search, area, and regional aggregate are queried.
    const baseline = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(catalog, DiscoveryQuerySchema.parse({ limit: 100 })),
    )
    const browse = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({ limit: 100 }),
        subwayCatalog([store]),
      ),
    )
    const search = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({ query: "서브웨이 부산", limit: 100 }),
        subwayCatalog([store]),
      ),
    )
    const salad = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({ filter: "salad_poke", query: "서브웨이", limit: 100 }),
        subwayCatalog([store]),
      ),
    )
    const saladSearch = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({ filter: "salad_poke", query: "서브웨이 샐러드", limit: 100 }),
        subwayCatalog([store]),
      ),
    )
    const saladArea = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({
          filter: "salad_poke",
          south: 35.15,
          north: 35.17,
          west: 129.15,
          east: 129.17,
          limit: 100,
        }),
        subwayCatalog([store]),
      ),
    )
    const saladRegions = DiscoveryRegionsResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({ filter: "salad_poke", query: "서브웨이", mode: "regions" }),
        subwayCatalog([store]),
      ),
    )

    // Then the approved presentation category is consistent without inventing a menu or ingredient.
    expect(browse.total).toBe(baseline.total + 1)
    expect(search.results).toEqual([
      expect.objectContaining({
        place: expect.objectContaining({ id: store.id, listingKind: "store_only" }),
        menus: [],
        matchingMenuIds: [],
      }),
    ])
    for (const response of [salad, saladSearch, saladArea]) {
      expect(response.results).toContainEqual(
        expect.objectContaining({
          place: expect.objectContaining({ id: store.id, listingKind: "store_only" }),
          menus: [],
          matchingMenuIds: [],
        }),
      )
    }
    expect(saladRegions.total).toBe(salad.total)
    for (const ingredient of ["chicken", "fish", "tofu_soy"] as const) {
      const ingredientResults = DiscoveryPlacesResponseSchema.parse(
        queryDiscoveryCatalog(
          catalog,
          DiscoveryQuerySchema.parse({ filter: "salad_poke", ingredient, limit: 100 }),
          subwayCatalog([store]),
        ),
      )
      expect(ingredientResults.results.some(({ place }) => place.id === store.id)).toBe(false)
    }
    for (const filter of ["grilled_steamed", "whole_grain", "plant_based", "rice"] as const) {
      const otherCategory = DiscoveryPlacesResponseSchema.parse(
        queryDiscoveryCatalog(
          catalog,
          DiscoveryQuerySchema.parse({ filter, limit: 100 }),
          subwayCatalog([store]),
        ),
      )
      expect(otherCategory.results.some(({ place }) => place.id === store.id)).toBe(false)
    }
  })

  it("keeps store-only pagination, region recovery, and cursors coherent", () => {
    // Given two store-only locations outside the menu-backed fixture's first page.
    const stores = [
      {
        id: "20000000-0000-5000-8000-000000000001",
        slug: "subway-1",
        officialStoreId: "1",
        name: "서브웨이 부산점",
        address: "부산광역시 해운대구 테스트로 1",
        latitude: 35.16,
        longitude: 129.16,
      },
      {
        id: "20000000-0000-5000-8000-000000000002",
        slug: "subway-2",
        officialStoreId: "2",
        name: "서브웨이 대전점",
        address: "대전광역시 중구 테스트로 2",
        latitude: 36.33,
        longitude: 127.42,
      },
    ].map((store) =>
      SubwayStoreSchema.parse({
        ...store,
        brandId: "subway",
        brandName: "서브웨이",
        officialDetailUrl: `https://www.subway.co.kr/storeDetail?franchiseNo=${store.officialStoreId}`,
        officialListingUrl: "https://subway.co.kr/storeSearch",
        observedAt: "2026-09-05T00:00:00.000Z",
      }),
    )

    // When the Subway salad category is paged and aggregated by region.
    const first = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({ filter: "salad_poke", query: "서브웨이", limit: 1 }),
        subwayCatalog(stores),
      ),
    )
    const second = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({
          filter: "salad_poke",
          query: "서브웨이",
          limit: 1,
          cursor: first.nextCursor,
        }),
        subwayCatalog(stores),
      ),
    )
    const regions = DiscoveryRegionsResponseSchema.parse(
      queryDiscoveryCatalog(
        catalog,
        DiscoveryQuerySchema.parse({ filter: "salad_poke", query: "서브웨이", mode: "regions" }),
        subwayCatalog(stores),
      ),
    )
    const stale = queryDiscoveryCatalog(
      catalog,
      DiscoveryQuerySchema.parse({
        filter: "salad_poke",
        query: "서브웨이",
        limit: 1,
        cursor: first.nextCursor,
      }),
      { version: "subway-replaced-snapshot", stores },
    )

    // Then totals and pages cover each stable store once and regional recovery sees both cities.
    expect(first.total).toBe(2)
    const pagedIds = [...first.results, ...second.results].map(({ place }) => place.id)
    expect(pagedIds).toHaveLength(2)
    expect(new Set(pagedIds).size).toBe(2)
    expect(regions.total).toBe(2)
    expect(regions.regions.map(({ id }) => id)).toEqual(["대전 중구", "부산 해운대구"])
    expect(stale).toEqual({ error: "stale_cursor", retry: true })
  })
  it("orders all matching places by normalized phrase relevance before distance", () => {
    // Given independently positioned exact, containing, menu, and token-only matches.
    const query = DiscoveryQuerySchema.parse({ query: "샐러드 특별", limit: 100 })

    // When the complete result set is queried.
    const response = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(orderingCatalog, query),
    )

    // Then full-phrase relevance wins even though distance prefers the reverse order.
    expect(response.results.map(({ place }) => place.id)).toEqual([
      "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01",
      "970347d1-7b9f-4b7d-8cd9-3674148c0e02",
      "17d03b81-1376-42ad-8031-14b559f3c003",
      "55005f59-f094-4b30-8e8a-447b1607da04",
    ])
    expect(response.sortBasis).toBe("catalog_center")
    expect(response.sortOrigin).toEqual({ latitude: 0, longitude: 0.025 })
  })
  it("orders blank-query results globally before pagination with stable ID ties", () => {
    // Given equal-distance places supplied in reverse stable-ID order.
    const tieCatalog = syntheticCatalog([
      {
        id: "00000000-0000-4000-8000-000000000012",
        menuId: "10000000-0000-4000-8000-000000000012",
        placeName: "동쪽",
        menuName: "한 끼",
        latitude: 0,
        longitude: 1,
      },
      {
        id: "00000000-0000-4000-8000-000000000011",
        menuId: "10000000-0000-4000-8000-000000000011",
        placeName: "서쪽",
        menuName: "한 끼",
        latitude: 0,
        longitude: -1,
      },
    ])

    // When both one-item pages are concatenated.
    const first = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(tieCatalog, DiscoveryQuerySchema.parse({ limit: 1 })),
    )
    const second = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(
        tieCatalog,
        DiscoveryQuerySchema.parse({ limit: 1, cursor: first.nextCursor }),
      ),
    )

    // Then pagination preserves the complete global order and response basis.
    expect([...first.results, ...second.results].map(({ place }) => place.id)).toEqual([
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
    ])
    expect(second.sortOrigin).toEqual(first.sortOrigin)
  })
  it("derives map and region anchors from the applied result scope", () => {
    // Given the same matching catalog under bounded, regional, and empty queries.
    const mapQuery = DiscoveryQuerySchema.parse({
      south: -1,
      north: 1,
      west: -2,
      east: 2,
      limit: 100,
    })
    const regionQuery = DiscoveryQuerySchema.parse({ region: "서울 중구", limit: 100 })
    const emptyQuery = DiscoveryQuerySchema.parse({ south: 40, north: 41, west: 130, east: 131 })

    // When each scope is queried.
    const map = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(orderingCatalog, mapQuery),
    )
    const region = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(orderingCatalog, regionQuery),
    )
    const empty = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(orderingCatalog, emptyQuery),
    )

    // Then each nonempty response names its actual center and an empty response has no origin.
    expect({ basis: map.sortBasis, origin: map.sortOrigin }).toEqual({
      basis: "map_center",
      origin: { latitude: 0, longitude: 0 },
    })
    expect({ basis: region.sortBasis, origin: region.sortOrigin }).toEqual({
      basis: "region_center",
      origin: { latitude: 0, longitude: 0.03 },
    })
    expect({ basis: empty.sortBasis, origin: empty.sortOrigin }).toEqual({
      basis: "map_center",
      origin: null,
    })
  })
  it("keeps order invariant to input order and rejects a cursor after its anchor changes", () => {
    // Given a first page and the same catalog with reversed source arrays.
    const firstQuery = DiscoveryQuerySchema.parse({ limit: 1 })
    const first = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(orderingCatalog, firstQuery),
    )
    const reversed = {
      ...orderingCatalog,
      places: [...orderingCatalog.places].reverse(),
      menus: [...orderingCatalog.menus].reverse(),
    }

    // When input order changes and then a prior cursor is reused with changed bounds.
    const reordered = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(reversed, firstQuery),
    )
    const stale = queryDiscoveryCatalog(
      orderingCatalog,
      DiscoveryQuerySchema.parse({
        limit: 1,
        south: -1,
        north: 1,
        west: -1,
        east: 1,
        cursor: first.nextCursor,
      }),
    )

    // Then source ordering is irrelevant and the changed ordering context rejects the cursor.
    expect(reordered).toEqual(first)
    expect(stale).toEqual({ error: "stale_cursor", retry: true })
  })
  it("rejects a cursor when a nonmatching active menu expires", () => {
    // Given a cursor and an active menu excluded by the current query predicate.
    const nonmatchingMenu = {
      ...orderingCatalog.menus[0],
      id: "10000000-0000-4000-8000-000000000099",
      name: "국밥",
      evidence: orderingCatalog.menus[0]?.evidence.map((evidence) => ({
        ...evidence,
        expiresAt: "2026-09-06T00:00:00Z",
      })),
    }
    const expiring = DiscoveryCatalogSchema.parse({
      ...orderingCatalog,
      menus: [...orderingCatalog.menus, nonmatchingMenu],
    })
    const first = DiscoveryPlacesResponseSchema.parse(
      queryDiscoveryCatalog(expiring, DiscoveryQuerySchema.parse({ query: "샐러드", limit: 1 })),
    )
    expect(first.results[0]?.matchingMenuIds).not.toContain(nonmatchingMenu.id)

    // When only the excluded menu expires and the matching results stay the same.
    const stale = queryDiscoveryCatalog(
      currentDiscoveryCatalog(expiring, Date.parse("2026-09-07T00:00:00Z")),
      DiscoveryQuerySchema.parse({ query: "샐러드", limit: 1, cursor: first.nextCursor }),
    )

    // Then pagination restarts instead of appending a differently anchored order.
    expect(stale).toEqual({ error: "stale_cursor", retry: true })
  })
  it("groups administrative aliases without losing places or mixing districts", () => {
    const responses = ["서울 강남구", "서울시 강남구", "서울특별시 강남구"].map((region) =>
      DiscoveryPlacesResponseSchema.parse(places(`region=${encodeURIComponent(region)}&limit=100`)),
    )
    const first = responses[0]
    expect(first?.total).toBeGreaterThan(1)
    for (const response of responses) expect(response).toEqual(first)
    const regions = DiscoveryRegionsResponseSchema.parse(places("mode=regions"))
    const district = regions.regions.filter((region) => region.id === "서울 강남구")
    expect(district).toHaveLength(1)
    expect(district[0]?.count).toBe(first?.total)
    expect(regions.regions.reduce((total, region) => total + region.count, 0)).toBe(regions.total)
    expect(first?.results.every(({ place }) => place.region === "서울 강남구")).toBe(true)
  })
  it("redacts source evidence and keeps page and count coherent", () => {
    const response = DiscoveryPlacesResponseSchema.parse(places("limit=2"))
    expect(response.results).toHaveLength(2)
    expect(
      response.results.every((result) => result.menus.every((menu) => !("status" in menu.facts))),
    ).toBe(true)
    expect(response.total).toBeGreaterThan(2)
    const json = JSON.stringify(response)
    for (const privateKey of [
      "rawText",
      "evidenceUrl",
      "sourceSha256",
      "reviewStatus",
      "placeMatch",
    ])
      expect(json).not.toContain(privateKey)
    expect(
      response.results.every((result) =>
        result.menus.every((menu) => result.matchingMenuIds.includes(menu.id)),
      ),
    ).toBe(true)
  })
  it("paginates stably and rejects cursor reuse across queries or catalog versions", () => {
    const first = DiscoveryPlacesResponseSchema.parse(places("limit=2"))
    const second = DiscoveryPlacesResponseSchema.parse(places(`limit=2&cursor=${first.nextCursor}`))
    expect(second.total).toBe(first.total)
    expect(
      second.results.some((result) =>
        first.results.some((prior) => prior.place.id === result.place.id),
      ),
    ).toBe(false)
    expect(places(`limit=2&query=changed&cursor=${first.nextCursor}`)).toEqual({
      error: "stale_cursor",
      retry: true,
    })
    expect(
      queryDiscoveryCatalog(
        { ...catalog, catalogVersion: "pilot-20260904-000000000000" },
        DiscoveryQuerySchema.parse({ limit: 2, cursor: first.nextCursor }),
      ),
    ).toEqual({ error: "stale_cursor", retry: true })
    expect(places("cursor=garbage")).toEqual({ error: "invalid_request", retry: false })
  })
  it("uses one same-menu predicate for regions, list, count and map data", () => {
    const response = DiscoveryPlacesResponseSchema.parse(
      places("filter=salad_poke&ingredient=fish"),
    )
    expect(
      response.results.every(({ menus }) =>
        menus.every(
          (menu) => menu.facts.form === "salad_poke" && menu.facts.ingredients.includes("fish"),
        ),
      ),
    ).toBe(true)
    const aggregate = places("mode=regions&filter=salad_poke&ingredient=fish")
    expect("total" in aggregate && aggregate.total).toBe(response.total)
    const empty = DiscoveryPlacesResponseSchema.parse(places("south=0&north=1&west=0&east=1"))
    expect(empty.total).toBe(0)
    expect(empty.results).toEqual([])
  })
  it("keeps a semantic region aggregate independent of a selected area", () => {
    // Given a current menu condition and a particular selected administrative area.
    const conditions = "filter=plant_based&ingredient=all"
    const aggregate = DiscoveryRegionsResponseSchema.parse(places(`mode=regions&${conditions}`))
    const selectedArea = DiscoveryPlacesResponseSchema.parse(
      places(`region=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC&${conditions}`),
    )

    // When the aggregate is requested without that selected area.
    const matchingArea = aggregate.regions.find((region) => region.id === "서울 강남구")

    // Then it remains the switchable, condition-scoped count for that area.
    expect(matchingArea?.count).toBe(selectedArea.total)
  })
  it("accepts finite worldwide coordinates but rejects impossible coordinates", () => {
    const target = catalog.places[0]
    if (!target) throw new Error("missing fixture")
    expect(
      DiscoveryCatalogSchema.safeParse({
        ...catalog,
        places: catalog.places.map((place) => ({ ...place, latitude: 35.1, longitude: 129.1 })),
      }).success,
    ).toBe(true)
    expect(
      DiscoveryCatalogSchema.safeParse({
        ...catalog,
        places: [{ ...target, latitude: Number.POSITIVE_INFINITY }],
      }).success,
    ).toBe(false)
  })
  it("requires explicit cooking plus ingredient and reason instead of generic meal facts", () => {
    const base = catalog.menus[0]
    if (!base) throw new Error("missing fixture")
    const generic = DiscoveryMenuSchema.parse({
      ...base,
      name: "닭국수",
      facts: {
        ...base.facts,
        scope: "meal",
        form: "noodles",
        dietary: "unknown",
        rice_base: "unknown",
        ingredients: ["chicken"],
        cooking: [],
        selection_reasons: [],
      },
    })
    expect(hasDiscoveryMealSelectionBasis(generic)).toBe(false)
    for (const cooking of ["grilled", "steamed", "roasted"]) {
      const explicit = DiscoveryMenuSchema.parse({
        ...generic,
        name: "닭구이",
        facts: {
          ...generic.facts,
          cooking: [cooking],
          selection_reasons: [{ kind: "ingredient_cooking", basis: "menu_name", text: "닭구이" }],
        },
      })
      expect(hasDiscoveryMealSelectionBasis(explicit)).toBe(true)
    }
  })
})

describe("v2 source semantics", () => {
  it("rejects legacy catalogs and unapproved media", () => {
    expect(
      DiscoveryCatalogSchema.safeParse({ ...catalog, schemaVersion: "pilot-menu-facts-1" }).success,
    ).toBe(false)
    const place = catalog.places[0]
    if (!place) throw new Error("missing fixture")
    expect(
      DiscoveryCatalogSchema.safeParse({
        ...catalog,
        places: catalog.places.map((item) =>
          item.id === place.id
            ? {
                ...item,
                media: [
                  {
                    url: "https://example.com/photo.jpg",
                    alt: "사진",
                    sourceUrl: "https://example.com",
                    scope: "place",
                    usageApproved: false,
                  },
                ],
              }
            : item,
        ),
      }).success,
    ).toBe(false)
  })
  it("does not infer eligibility from a mismatched or absent selection reason", () => {
    const menu = catalog.menus.find((menu) => hasDiscoveryMealSelectionBasis(menu))
    if (!menu) throw new Error("missing selected fixture")
    expect(
      hasDiscoveryMealSelectionBasis({ facts: { ...menu.facts, selection_reasons: [] } }),
    ).toBe(false)
    expect(
      hasDiscoveryMealSelectionBasis({
        facts: {
          ...menu.facts,
          form: "rice",
          rice_base: "unknown",
          dietary: "unknown",
          cooking: [],
          ingredients: [],
        },
      }),
    ).toBe(false)
  })
})
