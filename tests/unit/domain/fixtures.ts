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
  data_mode: "production",
}

export const VALID_MENU_ROW = {
  id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
  place_id: VALID_PLACE_ROW.id,
  name: "두부 채소 한상",
  health_tags: ["balanced", "plant_based"],
  evidence_url: "https://example.com/menu",
  verification_method: "official_menu",
  verified_at: "2026-08-13",
  valid_until: "2026-11-11",
  display_order: 0,
  published: true,
  data_mode: "production",
}

export const VALID_CATALOG_SNAPSHOT = {
  catalogVersion: "2026-08-21.1",
  dataMode: "production",
  places: [
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
      published: true,
      dataMode: "production",
    },
  ],
  menus: [
    {
      id: VALID_MENU_ROW.id,
      placeId: VALID_MENU_ROW.place_id,
      name: VALID_MENU_ROW.name,
      healthTags: VALID_MENU_ROW.health_tags,
      evidenceUrl: VALID_MENU_ROW.evidence_url,
      verificationMethod: VALID_MENU_ROW.verification_method,
      verifiedAt: VALID_MENU_ROW.verified_at,
      validUntil: VALID_MENU_ROW.valid_until,
      displayOrder: 0,
      published: true,
      dataMode: "production",
    },
  ],
} as const
