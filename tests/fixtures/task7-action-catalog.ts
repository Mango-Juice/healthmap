import { parseMenuRows, parsePlaceRows } from "../../lib/domain/catalog"
import type { DirectionsTarget } from "../../lib/domain/directions"

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
    id: "52eb446a-a1ec-445a-8769-b361006408b6",
    slug: "task7-production-fallback",
    name: "테스트 저장 장소 식당",
    address: "서울 강남구 테스트로 7길 3",
    latitude: 37.5034,
    longitude: 127.0313,
    naver_place_url: "https://map.naver.com/p/entry/place/912345679",
    primary_tag: "balanced",
    health_tags: ["balanced"],
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
    verification_method: "official_menu",
    verified_at: "2026-08-14",
    valid_until: "2026-11-12",
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
    verification_method: "official_menu",
    verified_at: "2026-08-14",
    valid_until: "2026-11-12",
    display_order: 1,
    published: true,
    data_mode: "production",
  },
])

const fallbackPlace = places.find((place) => place.slug === "task7-production-fallback")

if (fallbackPlace === undefined) throw new Error("Task7 fallback fixture place is missing")

export const task7ActionCatalog = {
  directionsTargets: {
    [fallbackPlace.id]: { kind: "place" },
  } satisfies Readonly<Partial<Record<(typeof places)[number]["id"], DirectionsTarget>>>,
  menus,
  places,
} as const
