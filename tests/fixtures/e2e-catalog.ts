import type { PublicCatalogSnapshot } from "../../lib/domain/catalog.ts"
import { PublicCatalogSnapshotSchema } from "../../lib/domain/catalog.ts"

const places = [
  [
    "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01",
    "test-sprout-square",
    "새싹 네모식당",
    37.5007,
    127.0328,
    "vegetables",
    ["vegetables", "balanced"],
  ],
  [
    "970347d1-7b9f-4b7d-8cd9-3674148c0e02",
    "test-rainbow-bowl",
    "무지개 한그릇 연구소",
    37.4978,
    127.0275,
    "protein",
    ["protein", "balanced"],
  ],
  [
    "17d03b81-1376-42ad-8031-14b559f3c003",
    "test-balance-lab",
    "균형 실험실 식탁",
    37.5041,
    127.0362,
    "balanced",
    ["vegetables", "protein", "balanced"],
  ],
  [
    "55005f59-f094-4b30-8e8a-447b1607da04",
    "test-leaf-table",
    "잎사귀 가상 테이블",
    37.4935,
    127.041,
    "plant_based",
    ["vegetables", "balanced", "plant_based"],
  ],
  [
    "d5e59fb4-ca69-4958-866e-5930163aad05",
    "test-cloud-canteen",
    "구름 도시락 공방",
    37.5079,
    127.0224,
    "vegetables",
    ["vegetables", "protein", "balanced", "plant_based"],
  ],
] as const

const menus = [
  ["bc6b1050-539e-4d28-8493-5920eae54201", 0, "초록 그릇", ["vegetables", "balanced"], 0],
  ["bede62e8-6e4d-4d3b-8227-34b73451b302", 0, "콩 곡물 접시", ["vegetables", "plant_based"], 1],
  ["c4e1cffb-2658-4ad4-8e38-c8c12a11c603", 1, "구운콩 단백 그릇", ["protein", "balanced"], 0],
  ["75708968-2839-4eba-8b44-f613de821d04", 1, "두부 곡물 그릇", ["protein", "plant_based"], 1],
  [
    "4ebaeeac-274e-494f-84ad-6ce34a48b605",
    2,
    "세 가지 균형 접시",
    ["vegetables", "protein", "balanced"],
    0,
  ],
  ["e68ddcb7-30bb-4e00-811c-b47303a73906", 2, "현미 채소 컵", ["vegetables", "balanced"], 1],
  ["ec13e8ec-df3f-4fbc-83f3-fa2f93d31c07", 3, "잎채소 콩밥", ["vegetables", "plant_based"], 0],
  ["9b36dc90-c43e-47e8-89b3-d077ebc7fc08", 3, "버섯 두부 접시", ["balanced", "plant_based"], 1],
  ["f1fb182b-f9d3-4a81-81ba-edeb24514009", 4, "구름 채소 도시락", ["vegetables", "balanced"], 0],
  ["e240fdb1-ff22-42d6-8473-6f311846f910", 4, "단백 콩 도시락", ["protein", "plant_based"], 1],
] as const

const parseE2eCatalog = (snapshot: unknown): PublicCatalogSnapshot =>
  PublicCatalogSnapshotSchema.parse(snapshot)

export const e2eCatalog = parseE2eCatalog({
  catalogVersion: "e2e-20260821",
  dataMode: "production",
  places: places.map(([id, slug, name, latitude, longitude, primaryTag, healthTags], index) => ({
    address: `서울 강남구 테스트로 ${index + 1}`,
    dataMode: "production",
    healthTags,
    id,
    latitude,
    longitude,
    name,
    naverPlaceUrl: `https://map.naver.com/p/entry/place/${index + 1}`,
    primaryTag,
    published: true,
    slug,
  })),
  menus: menus.map(([id, placeIndex, name, healthTags, displayOrder], index) => ({
    dataMode: "production",
    displayOrder,
    evidenceUrl: `https://sources.example.test/evidence/${index + 1}`,
    healthTags,
    id,
    name,
    placeId: places[placeIndex][0],
    published: true,
    verificationMethod: "official_menu",
    verifiedAt: "2026-08-14",
    validUntil: "2026-11-12",
  })),
})

export const longKoreanTypedStress = {
  address:
    "서울특별시 강남구 건강한 식생활 실천길 제철 채소 마을 1234 통곡물 건강 식문화 연구동 5층",
  evidenceUrl: `https://sources.example.test/evidence/${"scientific-provenance-record-".repeat(12)}`,
  menuName: "직접 재배한 제철 채소와 통곡물 단백질을 담은 오래 지속되는 균형 한상",
  placeName: "제철 채소와 통곡물의 균형을 오래 연구해 온 건강한 식생활 식탁",
  placeSlug: "test-sprout-square",
} as const

export const typedLongKoreanStressCatalog = parseE2eCatalog({
  ...e2eCatalog,
  catalogVersion: "e2e-20260821-long-korean-stress",
  menus: e2eCatalog.menus.map((menu) =>
    menu.placeId === "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01"
      ? {
          ...menu,
          evidenceUrl: longKoreanTypedStress.evidenceUrl,
          name: longKoreanTypedStress.menuName,
        }
      : menu,
  ),
  places: e2eCatalog.places.map((place) =>
    place.slug === longKoreanTypedStress.placeSlug
      ? {
          ...place,
          address: longKoreanTypedStress.address,
          name: longKoreanTypedStress.placeName,
        }
      : place,
  ),
})
