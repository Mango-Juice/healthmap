import { describe, expect, it } from "vitest"
import readinessQueries from "../../../scripts/analytics/readiness-queries.json"

type EventName =
  | "catalog_request_failed"
  | "catalog_result_received"
  | "directions_opened"
  | "filter_selected"
  | "map_viewed"
  | "place_opened"
  | "search_used"

type ReadinessEvent = Readonly<{
  browser: string
  event: EventName
  at: string
  placeId?: string
  resultBucket?: string
}>

const elapsedMinutes = (from: string, to: string): number =>
  (Date.parse(to) - Date.parse(from)) / 60_000

const distinctBrowsers = (events: readonly ReadinessEvent[]): ReadonlySet<string> =>
  new Set(events.map(({ browser }) => browser))

const convertedBrowsers = (events: readonly ReadinessEvent[]): ReadonlySet<string> => {
  const opened = events.filter(({ event }) => event === "place_opened")
  return new Set(
    opened.flatMap((start) =>
      events.some(
        (candidate) =>
          candidate.event === "directions_opened" &&
          candidate.browser === start.browser &&
          candidate.placeId === start.placeId &&
          elapsedMinutes(start.at, candidate.at) >= 0 &&
          elapsedMinutes(start.at, candidate.at) <= 30,
      )
        ? [start.browser]
        : [],
    ),
  )
}

const actedBrowsers = (events: readonly ReadinessEvent[]): ReadonlySet<string> => {
  const discovery = events.filter(({ event }) => ["filter_selected", "search_used"].includes(event))
  return new Set(
    discovery.flatMap((start) =>
      events.some(
        (candidate) =>
          candidate.event === "place_opened" &&
          candidate.browser === start.browser &&
          elapsedMinutes(start.at, candidate.at) >= 0 &&
          elapsedMinutes(start.at, candidate.at) <= 30,
      )
        ? [start.browser]
        : [],
    ),
  )
}

const retention = (
  events: readonly ReadinessEvent[],
  analysisEnd: string,
): Readonly<{ immature: number; matured: number; returned: number }> => {
  const firstViews = new Map<string, string>()
  for (const item of events.filter(({ event }) => event === "map_viewed")) {
    const previous = firstViews.get(item.browser)
    if (previous === undefined || item.at < previous) firstViews.set(item.browser, item.at)
  }
  const matured = [...firstViews].filter(
    ([, first]) => elapsedMinutes(first, analysisEnd) >= 20_160,
  )
  const returned = matured.filter(([browser, first]) =>
    events.some(
      (candidate) =>
        candidate.event === "place_opened" &&
        candidate.browser === browser &&
        candidate.at.slice(0, 10) > first.slice(0, 10) &&
        elapsedMinutes(first, candidate.at) >= 0 &&
        elapsedMinutes(first, candidate.at) <= 20_160,
    ),
  )
  return {
    immature: firstViews.size - matured.length,
    matured: matured.length,
    returned: returned.length,
  }
}

describe("regional readiness query definitions", () => {
  it("defines exactly the four approved metrics with unavailable zero-denominator output", () => {
    expect(readinessQueries.version).toBe(1)
    expect(readinessQueries.queries.map(({ id }) => id)).toEqual([
      "completed-first-page-zero-rate",
      "place-to-directions-30m",
      "discovery-to-place-30m",
      "matured-14d-return-proxy",
    ])
    for (const query of readinessQueries.queries) {
      expect(query.query.kind).toBe("HogQLQuery")
      expect(query.query.query).toContain("'unavailable'")
      expect(query.query.query).toContain("{variables.release_start}")
      expect(query.query.query).toContain("{variables.analysis_end}")
    }
  })

  it("uses completed first-page events as the zero-rate denominator and keeps errors separate", () => {
    const events: readonly ReadinessEvent[] = [
      {
        at: "2026-10-01T00:00:00Z",
        browser: "a",
        event: "catalog_result_received",
        resultBucket: "0",
      },
      {
        at: "2026-10-01T00:01:00Z",
        browser: "a",
        event: "catalog_result_received",
        resultBucket: "1_5",
      },
      { at: "2026-10-01T00:02:00Z", browser: "b", event: "catalog_request_failed" },
    ]
    const completed = events.filter(({ event }) => event === "catalog_result_received")
    expect(completed).toHaveLength(2)
    expect(completed.filter(({ resultBucket }) => resultBucket === "0")).toHaveLength(1)
    expect(events.filter(({ event }) => event === "catalog_request_failed")).toHaveLength(1)
  })

  it("counts one browser once despite duplicate same-place clicks", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:00:00Z", browser: "a", event: "place_opened", placeId: "p1" },
      { at: "2026-10-01T00:05:00Z", browser: "a", event: "directions_opened", placeId: "p1" },
      { at: "2026-10-01T00:06:00Z", browser: "a", event: "directions_opened", placeId: "p1" },
    ]
    expect(convertedBrowsers(events)).toEqual(new Set(["a"]))
  })

  it("rejects a direction click for a different place", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:00:00Z", browser: "a", event: "place_opened", placeId: "p1" },
      { at: "2026-10-01T00:05:00Z", browser: "a", event: "directions_opened", placeId: "p2" },
    ]
    expect(convertedBrowsers(events).size).toBe(0)
  })

  it("includes exactly 30 minutes and rejects a later direction click", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:00:00Z", browser: "boundary", event: "place_opened", placeId: "p1" },
      {
        at: "2026-10-01T00:30:00Z",
        browser: "boundary",
        event: "directions_opened",
        placeId: "p1",
      },
      { at: "2026-10-01T00:00:00Z", browser: "late", event: "place_opened", placeId: "p1" },
      { at: "2026-10-01T00:30:01Z", browser: "late", event: "directions_opened", placeId: "p1" },
    ]
    expect(convertedBrowsers(events)).toEqual(new Set(["boundary"]))
  })

  it("uses distinct discovery browsers and reports the complement as 후속 행동 미관측", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:00:00Z", browser: "acted", event: "search_used" },
      { at: "2026-10-01T00:01:00Z", browser: "acted", event: "filter_selected" },
      { at: "2026-10-01T00:30:00Z", browser: "acted", event: "place_opened", placeId: "p1" },
      { at: "2026-10-01T00:00:00Z", browser: "unobserved", event: "filter_selected" },
    ]
    const denominator = distinctBrowsers(
      events.filter(({ event }) => ["filter_selected", "search_used"].includes(event)),
    ).size
    expect({
      acted: actedBrowsers(events).size,
      후속행동미관측: denominator - actedBrowsers(events).size,
    }).toEqual({
      acted: 1,
      후속행동미관측: 1,
    })
  })

  it("separates a cohort that has not matured for 14 days", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:00:00Z", browser: "immature", event: "map_viewed" },
    ]
    expect(retention(events, "2026-10-14T23:59:59Z")).toEqual({
      immature: 1,
      matured: 0,
      returned: 0,
    })
  })

  it("uses the first map view and excludes same-calendar-day repeats", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T01:00:00Z", browser: "same-day", event: "map_viewed" },
      { at: "2026-10-01T02:00:00Z", browser: "same-day", event: "map_viewed" },
      { at: "2026-10-01T23:00:00Z", browser: "same-day", event: "place_opened", placeId: "p1" },
    ]
    expect(retention(events, "2026-10-15T01:00:00Z")).toEqual({
      immature: 0,
      matured: 1,
      returned: 0,
    })
  })

  it("includes a different Korean calendar date through the exact 14-day boundary", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:00:00Z", browser: "returned", event: "map_viewed" },
      { at: "2026-10-15T00:00:00Z", browser: "returned", event: "place_opened", placeId: "p1" },
    ]
    expect(retention(events, "2026-10-15T00:00:00Z")).toEqual({
      immature: 0,
      matured: 1,
      returned: 1,
    })
  })

  it("keeps zero denominators unavailable in every saved query", () => {
    for (const { query } of readinessQueries.queries) {
      expect(query.query).toMatch(/if\([^)]*(?:events|browsers) = 0, null,/)
    }
  })
})
