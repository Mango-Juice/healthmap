export const VALID_PLACE_ROW = {
  id: "bc6b1050-539e-4d28-8493-5920eae54248",
  slug: "green-table-gangnam",
  name: "그린테이블 강남점",
  address: "서울특별시 강남구 테헤란로 1",
  latitude: 37.5,
  longitude: 127.0328,
  naver_place_url: "https://map.naver.com/p/entry/place/900000",
  primary_tag: "balanced",
  health_tags: ["balanced", "vegetables"],
  published: true,
}

export const VALID_MENU_ROW = {
  id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
  place_id: VALID_PLACE_ROW.id,
  name: "두부 채소 한상",
  health_tags: ["balanced", "plant_based"],
  evidence_url: "https://example.com/menu",
  verified_at: "2026-08-13",
  display_order: 0,
  published: true,
}
