import { describe, expect, it } from "vitest"
import { auditCatalog } from "../../scripts/data/catalog-audit"
import { type Catalog, catalogSchema } from "../../scripts/data/catalog-schema"

function parseFixture(value: unknown): Catalog {
  return catalogSchema.parse(value)
}

describe("catalog audit", () => {
  it("reports exact aggregate requirements for an empty catalog", () => {
    const result = auditCatalog(parseFixture({ audited_on: "2026-08-13", places: [] }), "")
    expect(result.errors).toContain("catalog: expected exactly 40 published places, found 0")
    expect(result.errors).toContain("catalog: expected at least 80 unique published menus, found 0")
  })

  it("identifies the corrupted record and independent violated rules", () => {
    const corrupt = parseFixture({
      audited_on: "2026-08-13",
      places: [
        {
          id: "bc6b1050-539e-4d28-8493-5920eae54248",
          slug: "bad-bounds-record",
          name: "검증 실패 지점",
          address: "서울 강남구 테헤란로 1",
          latitude: 37.6,
          longitude: 127.03,
          naver_place_url: "https://map.naver.com/p/entry/place/1",
          primary_tag: "balanced",
          health_tags: ["protein"],
          published: true,
          menus: [],
        },
      ],
    })
    const errors = auditCatalog(corrupt, "").errors
    expect(errors).toContain("bad-bounds-record: coordinates outside display bounds")
    expect(errors).toContain("bad-bounds-record: primary_tag balanced missing from health_tags")
    expect(errors).toContain("bad-bounds-record: expected at least 2 published menus, found 0")
  })

  it("rejects malformed URLs before audit", () => {
    const malformed = {
      audited_on: "2026-08-13",
      places: [
        {
          id: "bc6b1050-539e-4d28-8493-5920eae54248",
          slug: "bad-url-record",
          name: "잘못된 URL 지점",
          address: "서울 강남구 테헤란로 1",
          latitude: 37.5,
          longitude: 127.03,
          naver_place_url: "http://example.com/place/1",
          primary_tag: "balanced",
          health_tags: ["balanced"],
          published: true,
          menus: [],
        },
      ],
    }
    expect(() => catalogSchema.parse(malformed)).toThrow()
  })

  it("reports duplicate, stale, and missing source integration by record", () => {
    const record = {
      id: "bc6b1050-539e-4d28-8493-5920eae54248",
      slug: "duplicate-record",
      name: "중복 검증 지점",
      address: "서울 강남구 테헤란로 1",
      latitude: 37.5,
      longitude: 127.03,
      naver_place_url: "https://map.naver.com/p/entry/place/1",
      primary_tag: "balanced" as const,
      health_tags: ["balanced" as const],
      published: true as const,
      menus: [
        {
          id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
          name: "현미 채소 한상",
          health_tags: ["balanced" as const],
          evidence_url: "https://example.com/menu/1",
          verified_at: "2026-06-01",
          display_order: 0,
          published: true as const,
        },
        {
          id: "f6a43353-4f04-4384-86ea-c145918e95c4",
          name: "두부 채소 한상",
          health_tags: ["balanced" as const],
          evidence_url: "https://example.com/menu/2",
          verified_at: "2026-08-13",
          display_order: 1,
          published: true as const,
        },
      ],
    }
    const catalog = parseFixture({
      audited_on: "2026-08-13",
      places: [record, { ...record, id: "bede62e8-6e4d-4d3b-8227-34b73451b3a4" }],
    })
    const errors = auditCatalog(catalog, "").errors
    expect(errors).toContain("duplicate-record: duplicate slug appears 2 times")
    expect(errors).toContain(
      "duplicate-record/2a8039ba-6862-4bf5-882c-298892e7caf0: evidence verification is 73 days old",
    )
    expect(errors).toContain("duplicate-record: missing compatible place row in supabase seed")
  })
})
