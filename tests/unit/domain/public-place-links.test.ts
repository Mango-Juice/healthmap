import { describe, expect, it } from "vitest"
import { ProductionPlaceV2Schema } from "../../../lib/domain/catalog-v2"
import { ExactNaverPlaceUrlSchema } from "../../../lib/domain/place-links"
import { getPublicNaverLinkKind } from "../../../lib/domain/public-place-links"
import { V2_PLACE } from "./catalog-v2-fixture"

const search = `https://map.naver.com/p/search/${encodeURIComponent(`${V2_PLACE.name} ${V2_PLACE.address}`)}`
describe("public v2 NAVER search fallback", () => {
  it("accepts generated name/address fallback without treating it as a known place ID", () => {
    expect(ProductionPlaceV2Schema.safeParse({ ...V2_PLACE, naverPlaceUrl: search }).success).toBe(
      true,
    )
    expect(ExactNaverPlaceUrlSchema.safeParse(search).success).toBe(false)
    expect(getPublicNaverLinkKind(search)).toBe("search")
    expect(getPublicNaverLinkKind(V2_PLACE.naverPlaceUrl)).toBe("exact")
    expect(
      ProductionPlaceV2Schema.safeParse({ ...V2_PLACE, name: "다른 이름", naverPlaceUrl: search })
        .success,
    ).toBe(false)
  })
  it.each([
    "https://map.naver.com/p/search/",
    "https://map.naver.com/p/search/%",
    "https://map.naver.com/p/search/test/other",
    "https://map.naver.com/p/search/%0A",
    `${search}#fragment`,
    `${search}?redirect=https://evil.example`,
    search.replace("map.naver.com", "user:pass@map.naver.com"),
    search.replace("map.naver.com", "evil.example"),
    search.replace("/p/search/", "/p/other/"),
  ])("rejects malformed or untrusted search URL %s", (naverPlaceUrl) => {
    expect(ProductionPlaceV2Schema.safeParse({ ...V2_PLACE, naverPlaceUrl }).success).toBe(false)
  })
})
