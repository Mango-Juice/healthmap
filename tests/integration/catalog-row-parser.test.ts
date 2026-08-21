import { describe, expect, it } from "vitest"
import { parseMenuRows, parsePlaceRows } from "../../lib/domain/catalog"

const VALID_PLACE_ROW = {
  id: "bc6b1050-539e-4d28-8493-5920eae54248",
  slug: "sentinel-published-place",
  name: "통합 테스트 게시 장소",
  address: "서울특별시 강남구 테스트로 1",
  latitude: 37.5,
  longitude: 127.0328,
  naver_place_url: "https://map.naver.com/p/entry/place/900000",
  primary_tag: "balanced",
  health_tags: ["balanced", "vegetables"],
  published: true,
  data_mode: "production",
}

describe("catalog row parser", () => {
  it("Given a valid Supabase place row, when parsed, then a camel-case place is returned", () => {
    // Given: a raw row from the Supabase JSON boundary.
    const rows: readonly unknown[] = [VALID_PLACE_ROW]

    // When: the boundary parser consumes the raw rows.
    const places = parsePlaceRows(rows)

    // Then: downstream code receives the public place contract, not raw snake-case data.
    expect(places).toEqual([
      {
        id: VALID_PLACE_ROW.id,
        slug: VALID_PLACE_ROW.slug,
        name: VALID_PLACE_ROW.name,
        address: VALID_PLACE_ROW.address,
        latitude: VALID_PLACE_ROW.latitude,
        longitude: VALID_PLACE_ROW.longitude,
        naverPlaceUrl: VALID_PLACE_ROW.naver_place_url,
        primaryTag: VALID_PLACE_ROW.primary_tag,
        healthTags: VALID_PLACE_ROW.health_tags,
        published: VALID_PLACE_ROW.published,
        dataMode: "production",
      },
    ])
  })

  it("Given a place row with malformed tags, when parsed, then parsing fails", () => {
    // Given: a row whose primary tag is absent from its tag collection.
    const malformedRow = { ...VALID_PLACE_ROW, health_tags: ["vegetables"] }

    // When: the boundary parser attempts to parse it.
    const parse = () => parsePlaceRows([malformedRow])

    // Then: the malformed row cannot cross the boundary.
    expect(parse).toThrow()
  })

  it("Given a Supabase row with an unknown key, when parsed, then parsing fails", () => {
    // Given: a valid row carrying a field outside the trusted database contract.
    const malformedRow = { ...VALID_PLACE_ROW, unexpected_secret: "must-not-cross" }

    // When: the boundary parser attempts to parse it.
    const parse = () => parsePlaceRows([malformedRow])

    // Then: the unknown field is rejected instead of silently stripped.
    expect(parse).toThrow()
  })

  it("Given a menu row with an insecure evidence URL, when parsed, then parsing fails", () => {
    // Given: an otherwise-shaped menu row with an HTTP evidence URL.
    const malformedRow = {
      id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
      place_id: VALID_PLACE_ROW.id,
      name: "통합 테스트 메뉴",
      health_tags: ["balanced"],
      evidence_url: "http://example.com/menu",
      verified_at: "2026-08-13",
      display_order: 0,
      published: true,
      data_mode: "production",
    }

    // When: the boundary parser attempts to parse it.
    const parse = () => parseMenuRows([malformedRow])

    // Then: insecure evidence is rejected.
    expect(parse).toThrow()
  })
})
