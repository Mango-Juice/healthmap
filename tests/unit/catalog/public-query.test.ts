import { describe, expect, it } from "vitest"
import { parsePublicCatalogQuery } from "../../../lib/catalog/query-contract"

describe("public query request boundary", () => {
  it("Given untrusted query strings, when parsed, then malformed requests fail closed", () => {
    for (const value of [
      "limit=51",
      "limit=",
      "query=a&query=b",
      "south=1",
      "west=2&east=1&north=2&south=1",
      "extra=1",
      "mode=regions&cursor=x",
    ])
      expect(parsePublicCatalogQuery(new URLSearchParams(value)).success).toBe(false)
    expect(parsePublicCatalogQuery(new URLSearchParams("mode=regions")).success).toBe(true)
  })
})

import { queryPublicCatalog } from "../../../lib/catalog/query"
import { PublicCatalogQuerySchema } from "../../../lib/catalog/query-contract"
import { PublicCatalogSnapshotSchema } from "../../../lib/domain/catalog"
import { VALID_CATALOG_SNAPSHOT } from "../domain/fixtures"

it("Given 51 public places, when queried, then bootstrap contains aggregates and pages reject stale cursors", () => {
  const catalog = PublicCatalogSnapshotSchema.parse({
    ...VALID_CATALOG_SNAPSHOT,
    places: Array.from({ length: 51 }, (_, index) => ({
      ...VALID_CATALOG_SNAPSHOT.places[0],
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      slug: `test-place-${index}`,
    })),
    menus: Array.from({ length: 51 }, (_, index) => ({
      ...VALID_CATALOG_SNAPSHOT.menus[0],
      id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      placeId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    })),
  })
  const regions = queryPublicCatalog(catalog, PublicCatalogQuerySchema.parse({ mode: "regions" }))
  expect(regions).toMatchObject({
    places: [],
    menus: [],
    total: 51,
    nextCursor: null,
    regions: [{ count: 51 }],
  })
  const first = queryPublicCatalog(catalog, PublicCatalogQuerySchema.parse({ limit: 1 }))
  if ("error" in first || first.nextCursor === null) throw new Error("Expected first page")
  expect(first.places).toHaveLength(1)
  expect(first.menus).toHaveLength(1)
  const second = queryPublicCatalog(
    catalog,
    PublicCatalogQuerySchema.parse({ limit: 1, cursor: first.nextCursor }),
  )
  expect(second).toMatchObject({ total: 51 })
  expect(second).not.toEqual(first)
  for (const changed of [
    { ...catalog, catalogVersion: "new" },
    { ...catalog, places: [...catalog.places].reverse() },
  ])
    expect(
      queryPublicCatalog(
        PublicCatalogSnapshotSchema.parse(changed),
        PublicCatalogQuerySchema.parse({ limit: 1, cursor: first.nextCursor }),
      ),
    ).toEqual({ error: "stale_cursor", retry: true })
  const raw: unknown = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"))
  const expired = Buffer.from(JSON.stringify({ ...Object(raw), expires: 0 })).toString("base64url")
  expect(
    queryPublicCatalog(catalog, PublicCatalogQuerySchema.parse({ limit: 1, cursor: expired })),
  ).toEqual({ error: "stale_cursor", retry: true })
  expect(
    queryPublicCatalog(catalog, PublicCatalogQuerySchema.parse({ cursor: "garbage" })),
  ).toEqual({ error: "invalid_request", retry: false })
})

import { V2_CATALOG, V2_MENU } from "../domain/catalog-v2-fixture"

it("Given fish grilled and chicken steamed on different menus, when combining fish with steamed, then counters and results remain zero", () => {
  const catalog = PublicCatalogSnapshotSchema.parse({
    ...V2_CATALOG,
    menus: [
      V2_MENU,
      {
        ...V2_MENU,
        id: "f6a43353-4f04-4384-86ea-c145918e95c4",
        facts: { ...V2_MENU.facts, ingredients: ["chicken"], cooking: ["steamed"] },
      },
    ],
  })
  const response = queryPublicCatalog(
    catalog,
    PublicCatalogQuerySchema.parse({ ingredient: "fish", cooking: "steamed" }),
  )
  expect(response).toMatchObject({ total: 0, places: [], menus: [], regions: [] })
  if ("error" in response) throw new Error("Expected valid query")
  expect(response.facets.every((facet) => facet.count === 0)).toBe(true)
})
