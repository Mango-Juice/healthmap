import { describe, expect, it } from "vitest"
import { PilotPlaceSchema } from "../../lib/pilot/catalog"
import { PilotMediaSchema } from "../../lib/pilot/facts"
import { buildPilotPlaceInfoUrl } from "../../lib/pilot/place-links"
import { parsePilotQuery } from "../../lib/pilot/query-contract"
import { ExactSubwayStoreUrlSchema } from "../../lib/pilot/subway-url"
import { syntheticPilotCatalog } from "../fixtures/pilot-catalog"

const place = syntheticPilotCatalog.places[0]
describe("Pilot link and coordinate trust boundaries", () => {
  it("builds a clean search destination when a synthetic place has no exact URL", () => {
    const syntheticPlace = PilotPlaceSchema.parse(
      syntheticPilotCatalog.places.find((entry) => entry.slug === "synthetic-link-place"),
    )
    expect(buildPilotPlaceInfoUrl(syntheticPlace)).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent("경기 수원시 테스트 링크 장소")}`,
    )
    const exact = "https://map.naver.com/p/entry/place/123"
    expect(buildPilotPlaceInfoUrl({ ...syntheticPlace, naverPlaceUrl: exact })).toBe(exact)
  })
  it("accepts only exact clean NAVER place destinations", () => {
    for (const naverPlaceUrl of [
      "https://map.naver.com/p/entry/place/123",
      "https://m.place.naver.com/restaurant/123/home",
    ])
      expect(PilotPlaceSchema.safeParse({ ...place, naverPlaceUrl }).success).toBe(true)
    for (const naverPlaceUrl of [
      "https://user:password@map.naver.com/p/entry/place/123",
      "https://map.naver.com/p/entry/place/123#fragment",
      "https://map.naver.com/p/search/anything",
      "https://map.naver.com:444/p/entry/place/123",
    ])
      expect(PilotPlaceSchema.safeParse({ ...place, naverPlaceUrl }).success).toBe(false)
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
    expect(PilotMediaSchema.safeParse(media).success).toBe(true)
    for (const url of [
      "https://untrusted.example/photo.jpg",
      "https://slowcali.co.kr/synthetic-0e9fbf3c3b/photo.svg",
      "https://user:secret@www.slowcali.co.kr/photo.jpg",
      "https://slowcali.co.kr/synthetic-0e9fbf3c3b/photo.jpg#fragment",
      "https://www.slowcali.co.kr:444/photo.jpg",
    ])
      expect(PilotMediaSchema.safeParse({ ...media, url }).success).toBe(false)
    expect(
      PilotMediaSchema.safeParse({ ...media, sourceUrl: "https://untrusted.example/" }).success,
    ).toBe(false)
    expect(PilotMediaSchema.safeParse({ ...media, menuIds: [] }).success).toBe(false)
    expect(
      PilotMediaSchema.safeParse({ ...media, subject: "venue", scope: "brand", menuIds: [] })
        .success,
    ).toBe(false)
  })
  it("rejects whitespace coordinates rather than coercing them to zero", () => {
    expect(parsePilotQuery(new URLSearchParams("south=+&north=1&west=0&east=1")).success).toBe(
      false,
    )
    expect(parsePilotQuery(new URLSearchParams("south=%090&north=1&west=0&east=1")).success).toBe(
      false,
    )
  })
})
