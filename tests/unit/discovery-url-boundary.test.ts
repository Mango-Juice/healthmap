import { describe, expect, it } from "vitest"
import { DiscoveryPlaceDtoSchema } from "../../lib/discovery/dto"
import { DiscoveryMediaSchema } from "../../lib/discovery/facts"
import { buildDiscoveryPlaceInfoUrl } from "../../lib/discovery/place-links"
import { parseDiscoveryQuery } from "../../lib/discovery/query-contract"
import { ExactSubwayStoreUrlSchema } from "../../lib/discovery/subway-url"

const place = DiscoveryPlaceDtoSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "test-link-place",
  name: "테스트 링크 장소",
  brandId: null,
  address: "경기 수원시 테스트로 1",
  latitude: 37.26,
  longitude: 127.02,
  region: "경기 수원시",
  phone: null,
  naverPlaceUrl: null,
  media: [],
  listingKind: "menu_evidence",
  storeDescription: null,
  officialStoreUrl: null,
})
describe("Discovery link and coordinate trust boundaries", () => {
  it("builds a clean search destination when a synthetic place has no exact URL", () => {
    expect(buildDiscoveryPlaceInfoUrl(place)).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent("경기 수원시 테스트 링크 장소")}`,
    )
    const stored = "https://naver.me/current-place-link"
    const withStoredLink = DiscoveryPlaceDtoSchema.parse({ ...place, naverPlaceUrl: stored })
    expect(buildDiscoveryPlaceInfoUrl(withStoredLink)).toBe(stored)
  })
  it("accepts only exact clean Subway listing and store destinations", () => {
    for (const url of [
      "https://subway.co.kr/storeSearch",
      "https://subway.co.kr/storeDetail?franchiseNo=9000049",
    ])
      expect(ExactSubwayStoreUrlSchema.safeParse(url).success).toBe(true)
    for (const url of [
      "https://user:secret@www.subway.co.kr/storeDetail?franchiseNo=39",
      "https://subway.co.kr/storeDetail?franchiseNo=9000049#fragment",
      "https://subway.co.kr/storeDetail?franchiseNo=9000049&token=secret",
      "https://www.subway.co.kr/other?franchiseNo=39",
    ])
      expect(ExactSubwayStoreUrlSchema.safeParse(url).success).toBe(false)
  })
  it("requires a clean approved-source raster media URL and source attribution", () => {
    const media = {
      url: "https://slowcali.co.kr/synthetic-0e9fbf3c3b/images/meal.jpg",
      sourceUrl: "https://slowcali.co.kr/synthetic-0e9fbf3c3b/",
      scope: "brand",
      usageApproved: true,
      alt: "메뉴",
      subject: "menu",
      menuIds: ["11111111-1111-5111-8111-111111111111"],
      attribution: "공식 메뉴 페이지",
    }
    expect(DiscoveryMediaSchema.safeParse(media).success).toBe(true)
    for (const url of [
      "https://untrusted.example/photo.jpg",
      "https://slowcali.co.kr/synthetic-0e9fbf3c3b/photo.svg",
      "https://user:secret@www.slowcali.co.kr/photo.jpg",
      "https://slowcali.co.kr/synthetic-0e9fbf3c3b/photo.jpg#fragment",
      "https://www.slowcali.co.kr:444/photo.jpg",
    ])
      expect(DiscoveryMediaSchema.safeParse({ ...media, url }).success).toBe(false)
    expect(
      DiscoveryMediaSchema.safeParse({ ...media, sourceUrl: "https://untrusted.example/" }).success,
    ).toBe(false)
    expect(DiscoveryMediaSchema.safeParse({ ...media, menuIds: [] }).success).toBe(false)
    expect(
      DiscoveryMediaSchema.safeParse({ ...media, subject: "venue", scope: "brand", menuIds: [] })
        .success,
    ).toBe(false)
  })
  it("rejects whitespace coordinates rather than coercing them to zero", () => {
    expect(parseDiscoveryQuery(new URLSearchParams("south=+&north=1&west=0&east=1")).success).toBe(
      false,
    )
    expect(
      parseDiscoveryQuery(new URLSearchParams("south=%090&north=1&west=0&east=1")).success,
    ).toBe(false)
  })
})
