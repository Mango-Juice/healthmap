import { parseMenuRows, parsePlaceRows } from "../lib/domain/catalog.ts"
import { filterDiscoveryPlaces, normalizeDiscoveryQuery } from "../lib/domain/discovery.ts"
import { sortPlacesByDistance } from "../lib/domain/distance.ts"
import { parseMapShareQuery, serializeMapShareQuery } from "../lib/domain/share-query.ts"
import {
  applyCurrentViewport,
  createViewportState,
  recordViewportMovement,
  type ViewportBounds,
} from "../lib/domain/viewport.ts"

const TOKEN_ID = "bc6b1050-539e-4d28-8493-5920eae54248"
const LONG_ID = "bede62e8-6e4d-4d3b-8227-34b73451b3a4"
const URL_ID = "c4e1cffb-2658-4ad4-8e38-c8c12a11c627"
const EARLIER_TIE_ID = "75708968-2839-4eba-8b44-f613de821d6c"
const LATER_TIE_ID = "4ebaeeac-274e-494f-84ad-6ce34a48b6f5"
const fullWidthProtein = String.fromCodePoint(
  0xff30,
  0xff32,
  0xff2f,
  0xff34,
  0xff25,
  0xff29,
  0xff2e,
)
const tokenQuery = `  ${fullWidthProtein}\u3000BOWL  `
const longKoreanToken = "가".repeat(128)
const urlShapedToken = ["https:", "", "fixture.example", "menu"].join("/")
const appliedBounds: ViewportBounds = {
  southWest: { latitude: 37.499, longitude: 127.031 },
  northEast: { latitude: 37.502, longitude: 127.035 },
}
const movedBounds: ViewportBounds = {
  southWest: { latitude: 37.498, longitude: 127.03 },
  northEast: { latitude: 37.503, longitude: 127.036 },
}
const baseRow = {
  id: TOKEN_ID,
  slug: "fixture-token",
  name: "fixture token",
  address: "fixture address",
  latitude: 37.5,
  longitude: 127.0328,
  naver_place_url: "https://map.naver.com/p/entry/place/900000",
  primary_tag: "vegetables",
  health_tags: ["vegetables"],
  published: true,
  data_mode: "production",
}
const rows = parsePlaceRows([
  baseRow,
  {
    ...baseRow,
    id: LONG_ID,
    slug: "fixture-long",
    name: "fixture long",
    latitude: 37.5005,
    longitude: 127.033,
  },
  {
    ...baseRow,
    id: URL_ID,
    slug: "fixture-url",
    name: "fixture url",
    address: urlShapedToken,
    latitude: 37.501,
    longitude: 127.0332,
  },
])
const menus = parseMenuRows([
  {
    id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
    place_id: TOKEN_ID,
    name: `${fullWidthProtein} Bowl`,
    health_tags: ["vegetables"],
    evidence_url: "https://example.com/menu",
    verification_method: "official_menu",
    verified_at: "2026-08-13",
    valid_until: "2026-11-11",
    display_order: 0,
    published: true,
    data_mode: "production",
  },
  {
    id: "f6a43353-4f04-4384-86ea-c145918e95c4",
    place_id: LONG_ID,
    name: longKoreanToken,
    health_tags: ["vegetables"],
    evidence_url: "https://example.com/menu",
    verification_method: "official_menu",
    verified_at: "2026-08-13",
    valid_until: "2026-11-11",
    display_order: 1,
    published: true,
    data_mode: "production",
  },
])
const tiedRows = parsePlaceRows([
  { ...baseRow, id: EARLIER_TIE_ID, slug: "fixture-earlier", name: "가게" },
  { ...baseRow, id: LATER_TIE_ID, slug: "fixture-later", name: "가게" },
])
const filter = (query: string): readonly string[] =>
  filterDiscoveryPlaces({ places: rows, menus, query, tag: "vegetables", appliedBounds }).map(
    (candidate) => candidate.id,
  )
const nfkcTokenAndIds = filter(tokenQuery)
const blankQueryIds = filter("")
const longKoreanIds = filter(longKoreanToken)
const urlShapedIds = filter(urlShapedToken)
const canonicalShareQuery = serializeMapShareQuery({
  q: "",
  tag: "vegetables",
  lat: 37.5,
  lng: 127.0328,
  z: 15,
})
const malformedShare = parseMapShareQuery(
  "q=&q=duplicate&tag=vegetables&lat=37.5&lng=127.0328&z=15",
)
const unknownShare = parseMapShareQuery("q=&tag=unknown&lat=37.5&lng=127.0328&z=15")
const outOfBoundsShare = parseMapShareQuery("q=&tag=vegetables&lat=91&lng=0&z=15")
const afterMovement = recordViewportMovement(createViewportState(appliedBounds), movedBounds)
const afterCommit = applyCurrentViewport(afterMovement)
const stableDistanceTieIds = sortPlacesByDistance({
  places: tiedRows,
  appliedBounds,
}).map(({ place }) => place.id)
const observations = {
  nfkcTokenAndIds,
  blankQueryIds,
  longKoreanIds,
  urlShapedIds,
  canonicalShareQuery,
  malformedShare,
  unknownShare,
  outOfBoundsShare,
  viewportPendingAfterMovement:
    afterMovement.appliedBounds === appliedBounds && afterMovement.currentBounds === movedBounds,
  viewportAppliedAfterCommit: afterCommit.appliedBounds === movedBounds,
  stableDistanceTieIds,
} as const
const assertions = {
  nfkcLowercaseWhitespace:
    normalizeDiscoveryQuery(tokenQuery) === "protein bowl" &&
    nfkcTokenAndIds.join(",") === TOKEN_ID,
  blankQuery: blankQueryIds.join(",") === `${TOKEN_ID},${LONG_ID},${URL_ID}`,
  tokenAnd: nfkcTokenAndIds.join(",") === TOKEN_ID,
  malformedRejected: malformedShare === null,
  unknownRejected: unknownShare === null,
  outOfBoundsRejected: outOfBoundsShare === null,
  canonicalShareKeys: canonicalShareQuery === "q=&tag=vegetables&lat=37.5&lng=127.0328&z=15",
  longKorean: longKoreanIds.join(",") === LONG_ID,
  urlShaped: urlShapedIds.join(",") === URL_ID,
  viewportCommit:
    observations.viewportPendingAfterMovement && observations.viewportAppliedAfterCommit,
  stableDistanceTie: stableDistanceTieIds.join(",") === `${EARLIER_TIE_ID},${LATER_TIE_ID}`,
} as const
const pass = Object.values(assertions).every(Boolean)

process.stdout.write(
  `${JSON.stringify({ status: pass ? "PASS" : "FAIL", observations, assertions }, null, 2)}\n`,
)
if (!pass) process.exitCode = 1
