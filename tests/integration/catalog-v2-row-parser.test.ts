import { describe, expect, it } from "vitest"
import { parseMenuRows, parsePlaceRows } from "../../lib/domain/catalog"
import { V2_MENU, V2_PLACE } from "../unit/domain/catalog-v2-fixture"

const placeRow = {
  schema_version: "2.0.0",
  id: V2_PLACE.id,
  slug: V2_PLACE.slug,
  name: V2_PLACE.name,
  address: V2_PLACE.address,
  latitude: V2_PLACE.latitude,
  longitude: V2_PLACE.longitude,
  naver_place_url: V2_PLACE.naverPlaceUrl,
  published: true,
  data_mode: "production",
  phone: null,
  brand_id: null,
  brand_variant: null,
  media: [],
}
const menuRow = {
  schema_version: "2.0.0",
  id: V2_MENU.id,
  place_id: V2_MENU.placeId,
  name: V2_MENU.name,
  evidence_url: V2_MENU.evidenceUrl,
  verification_method: V2_MENU.verificationMethod,
  verified_at: V2_MENU.verifiedAt,
  valid_until: V2_MENU.validUntil,
  display_order: 0,
  published: true,
  data_mode: "production",
  brand_id: null,
  brand_variant: null,
  branch_applicability: V2_MENU.branchApplicability,
  facts: V2_MENU.facts,
}
describe("v2 Supabase row adapters", () => {
  it("parses nationwide rows with exact reviewed facts and no legacy tags", () => {
    expect(parsePlaceRows([placeRow])).toEqual([V2_PLACE])
    expect(parseMenuRows([menuRow])).toEqual([V2_MENU])
  })
  it("accepts a generated name and address NAVER search fallback", () => {
    const naverPlaceUrl = `https://map.naver.com/p/search/${encodeURIComponent(`${V2_PLACE.name} ${V2_PLACE.address}`)}`
    expect(parsePlaceRows([{ ...placeRow, naver_place_url: naverPlaceUrl }])).toEqual([
      { ...V2_PLACE, naverPlaceUrl },
    ])
  })
  it("rejects unknown raw fields and private candidate facts", () => {
    expect(() => parsePlaceRows([{ ...placeRow, source_sha256: "private" }])).toThrow()
    expect(() =>
      parseMenuRows([{ ...menuRow, facts: { ...menuRow.facts, status: "candidate" } }]),
    ).toThrow()
    expect(() => parseMenuRows([{ ...menuRow, review_status: "approved" }])).toThrow()
  })
  it("rejects invalid coordinates and non-place navigation links", () => {
    expect(() => parsePlaceRows([{ ...placeRow, longitude: 181 }])).toThrow()
    expect(() =>
      parsePlaceRows([{ ...placeRow, naver_place_url: "https://map.naver.com/p/search/test" }]),
    ).toThrow()
    expect(() =>
      parsePlaceRows([
        { ...placeRow, naver_place_url: "https://user:pass@map.naver.com/p/entry/place/1" },
      ]),
    ).toThrow()
  })
})
