import { describe, expect, it } from "vitest"
import catalog from "../../data/catalog.json"
import { auditCatalog } from "../../scripts/data/catalog-audit"
import { catalogSchema } from "../../scripts/data/catalog-schema"

const seed = `insert into public.places (id, slug) values ${catalog.places.map((place) => `('${place.id}', '${place.slug}')`).join(",")};\ninsert into public.menus (id, place_id) values ${catalog.places.flatMap((place) => place.menus.map((menu) => `('${menu.id}', '${place.id}')`)).join(",")};`

describe("mock catalog boundary", () => {
  it("audits exactly five labeled mock places and ten menus", () => {
    const result = auditCatalog({ catalog: catalogSchema.parse(catalog), seedSql: seed })
    expect(result.errors).toEqual([])
    expect(result.placeCount).toBe(5)
    expect(result.menuCount).toBe(10)
    expect(result.tagDistribution).toMatchObject({
      vegetables: 4,
      protein: 3,
      balanced: 5,
      plant_based: 2,
    })
  })

  it("rejects unmarked or legacy-shaped catalog records", () => {
    expect(() => catalogSchema.parse({ ...catalog, data_mode: "real" })).toThrow()
    expect(() =>
      catalogSchema.parse({ ...catalog, places: catalog.places.slice(0, 4) }),
    ).not.toThrow()
    const malformed = { ...catalog, places: [{ ...catalog.places[0], slug: "old-real-place" }] }
    expect(() => catalogSchema.parse(malformed)).toThrow()
  })

  it("rejects non-actionable boundary violations", () => {
    const malformed = {
      ...catalog,
      places: [
        { ...catalog.places[0], naver_place_url: "https://map.naver.com/p/entry/place/1" },
        ...catalog.places.slice(1),
      ],
    }
    expect(() => catalogSchema.parse(malformed)).toThrow()
  })
})
