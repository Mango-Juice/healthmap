import { ZodError } from "zod"
import { parseAnalyticsEvent } from "../lib/domain/analytics.ts"
import { parseMenuRows, parsePlaceRows } from "../lib/domain/catalog.ts"
import { filterPlaces } from "../lib/domain/filter.ts"
import { resolveLocationOutcome } from "../lib/domain/geo.ts"
import { canonicalizeShareUrl } from "../lib/domain/share.ts"

const placeRow = {
  id: "bc6b1050-539e-4d28-8493-5920eae54248",
  slug: "green-table-gangnam",
  name: "catalog-value-not-emitted",
  address: "catalog-value-not-emitted",
  latitude: 37.5,
  longitude: 127.0328,
  naver_place_url: "https://map.naver.com/p/entry/place/900000",
  primary_tag: "balanced",
  health_tags: ["balanced", "vegetables"],
  published: true,
  data_mode: "production",
}

const menuRow = {
  id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
  place_id: placeRow.id,
  name: "catalog-value-not-emitted",
  health_tags: ["balanced"],
  evidence_url: "https://example.com/menu",
  verified_at: "2026-08-13",
  display_order: 0,
  published: true,
  data_mode: "production",
}

const isRejected = (input: unknown): boolean => {
  try {
    parseAnalyticsEvent(input)
    return false
  } catch (error) {
    if (error instanceof ZodError) return true
    throw error
  }
}

const places = parsePlaceRows([placeRow])
const menus = parseMenuRows([menuRow])
const canonicalUrls = [
  canonicalizeShareUrl("/?place=green-table-gangnam&lat=private&src=tracker"),
  canonicalizeShareUrl("/?lat=37.50074&lng=127.03284&z=15&tag=balanced&src=map_share"),
  canonicalizeShareUrl("/?lat=37.5&lng=127.03"),
  canonicalizeShareUrl("/?place=INVALID%20SLUG&referrer=https://private.example/?q=secret"),
]
const locationKinds = [
  resolveLocationOutcome({ kind: "success", point: { latitude: 37.5, longitude: 127.0328 } }),
  resolveLocationOutcome({ kind: "success", point: { latitude: 37.6, longitude: 127.0328 } }),
  resolveLocationOutcome({ kind: "error", code: 1 }),
  resolveLocationOutcome({ kind: "error", code: 3 }),
  resolveLocationOutcome({ kind: "unsupported" }),
].map((state) => state.kind)
const rejectsUrl = isRejected({
  event: "map_viewed",
  properties: { source: "direct", url: "https://private.example/?q=secret" },
})
const rejectsCoordinates = isRejected({
  event: "place_opened",
  properties: { place_id: "37.5007,127.0328", source: "map" },
})
const rejectsFreeText = isRejected({
  event: "share_completed",
  properties: { target: "map", outcome: "copied catalog-value-not-emitted" },
})

const checks = {
  share: {
    canonicalUrls,
    pass:
      canonicalUrls[0] === "/?place=green-table-gangnam&src=place_share" &&
      canonicalUrls[1] === "/?lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share" &&
      canonicalUrls[2] === "/" &&
      canonicalUrls[3] === "/",
  },
  location: {
    kinds: locationKinds,
    pass: locationKinds.join(",") === "inside,outside,denied,timeout,unsupported",
  },
  filter: {
    allCount: filterPlaces(places, "all").length,
    matchingCount: filterPlaces(places, "vegetables").length,
    absentCount: filterPlaces(places, "protein").length,
    pass:
      filterPlaces(places, "all").length === 1 &&
      filterPlaces(places, "vegetables").length === 1 &&
      filterPlaces(places, "protein").length === 0,
  },
  catalog: {
    placeCount: places.length,
    menuCount: menus.length,
    pass: places.length === 1 && menus.length === 1,
  },
  analytics: {
    validTag: parseAnalyticsEvent({
      event: "filter_selected",
      properties: { tag: "balanced" },
    }).event,
    rejectsUrl,
    rejectsCoordinates,
    rejectsFreeText,
    pass: rejectsUrl && rejectsCoordinates && rejectsFreeText,
  },
} as const

const pass =
  checks.share.pass &&
  checks.location.pass &&
  checks.filter.pass &&
  checks.catalog.pass &&
  checks.analytics.rejectsUrl &&
  checks.analytics.rejectsCoordinates &&
  checks.analytics.rejectsFreeText

process.stdout.write(`${JSON.stringify({ status: pass ? "PASS" : "FAIL", checks }, null, 2)}\n`)
if (!pass) process.exitCode = 1
