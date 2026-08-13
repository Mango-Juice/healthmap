import { parseMenuRows, parsePlaceRows } from "../../lib/domain/catalog"

const places = parsePlaceRows([
  {
    id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
    slug: "task7-production-route",
    name: "테스트 생산 경로 식당",
    address: "서울 강남구 테스트로 7길 1",
    latitude: 37.5032,
    longitude: 127.0311,
    naver_place_url: "https://map.naver.com/p/entry/place/912345678",
    primary_tag: "balanced",
    health_tags: ["balanced", "protein"],
    published: true,
    data_mode: "production",
  },
  {
    id: "f6a43353-4f04-4384-86ea-c145918e95c4",
    slug: "task7-unpublished-place",
    name: "테스트 비공개 식당",
    address: "서울 강남구 테스트로 7길 2",
    latitude: 37.5033,
    longitude: 127.0312,
    naver_place_url: "https://map.naver.com/p/entry/place/912345679",
    primary_tag: "balanced",
    health_tags: ["balanced"],
    published: false,
    data_mode: "production",
  },
])

const menus = parseMenuRows([
  {
    id: "21000000-0000-4000-8000-000000000001",
    place_id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
    name: "테스트 생산 메뉴 하나",
    health_tags: ["balanced", "protein"],
    evidence_url: "https://example.com/evidence/task7-route-1",
    verified_at: "2026-08-14",
    display_order: 0,
    published: true,
    data_mode: "production",
  },
  {
    id: "21000000-0000-4000-8000-000000000002",
    place_id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
    name: "테스트 생산 메뉴 둘",
    health_tags: ["balanced"],
    evidence_url: "https://example.com/evidence/task7-route-2",
    verified_at: "2026-08-14",
    display_order: 1,
    published: true,
    data_mode: "production",
  },
])

export const task7ActionCatalog = { menus, places } as const
