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

const seoulDay = (timestamp: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).format(new Date(timestamp))

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
  releaseStart: string,
  analysisEnd: string,
): Readonly<{ immature: number; matured: number; returned: number }> => {
  const firstViews = new Map<string, string>()
  for (const item of events.filter(
    ({ at, event }) => event === "map_viewed" && at >= releaseStart && at <= analysisEnd,
  )) {
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
        candidate.at >= releaseStart &&
        candidate.at <= analysisEnd &&
        seoulDay(candidate.at) > seoulDay(first) &&
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
    expect(readinessQueries.queries[3]?.query.query).toContain("toTimeZone(opened, 'Asia/Seoul')")
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

  it("rejects direction and place actions that precede their triggering events", () => {
    const directionEvents: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:05:00Z", browser: "a", event: "place_opened", placeId: "p1" },
      { at: "2026-10-01T00:04:59Z", browser: "a", event: "directions_opened", placeId: "p1" },
    ]
    const discoveryEvents: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:05:00Z", browser: "b", event: "search_used" },
      { at: "2026-10-01T00:04:59Z", browser: "b", event: "place_opened", placeId: "p1" },
    ]
    expect(convertedBrowsers(directionEvents).size).toBe(0)
    expect(actedBrowsers(discoveryEvents).size).toBe(0)
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
    expect(retention(events, "2026-10-01T00:00:00Z", "2026-10-14T23:59:59Z")).toEqual({
      immature: 1,
      matured: 0,
      returned: 0,
    })
  })

  it("uses the first map view and excludes same-calendar-day repeats", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T01:00:00Z", browser: "same-day", event: "map_viewed" },
      { at: "2026-10-01T02:00:00Z", browser: "same-day", event: "map_viewed" },
      { at: "2026-10-01T13:00:00Z", browser: "same-day", event: "place_opened", placeId: "p1" },
    ]
    expect(retention(events, "2026-10-01T00:00:00Z", "2026-10-15T01:00:00Z")).toEqual({
      immature: 0,
      matured: 1,
      returned: 0,
    })
  })

  it("selects the first map view inside the release window", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-09-30T00:00:00Z", browser: "windowed", event: "map_viewed" },
      { at: "2026-10-01T00:00:00Z", browser: "windowed", event: "map_viewed" },
      { at: "2026-10-02T00:00:00Z", browser: "windowed", event: "place_opened", placeId: "p1" },
    ]
    expect(retention(events, "2026-10-01T00:00:00Z", "2026-10-15T00:00:00Z")).toEqual({
      immature: 0,
      matured: 1,
      returned: 1,
    })
  })

  it("includes a different Korean calendar date through the exact 14-day boundary", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T00:00:00Z", browser: "returned", event: "map_viewed" },
      { at: "2026-10-15T00:00:00Z", browser: "returned", event: "place_opened", placeId: "p1" },
    ]
    expect(retention(events, "2026-10-01T00:00:00Z", "2026-10-15T00:00:00Z")).toEqual({
      immature: 0,
      matured: 1,
      returned: 1,
    })
  })

  it("includes a Seoul midnight crossing within one UTC date", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T14:30:00Z", browser: "crossing", event: "map_viewed" },
      { at: "2026-10-01T15:30:00Z", browser: "crossing", event: "place_opened", placeId: "p1" },
    ]
    expect(retention(events, "2026-10-01T00:00:00Z", "2026-10-15T14:30:00Z")).toEqual({
      immature: 0,
      matured: 1,
      returned: 1,
    })
  })

  it("excludes a UTC date crossing that stays on one Seoul date", () => {
    const events: readonly ReadinessEvent[] = [
      { at: "2026-10-01T15:30:00Z", browser: "same-seoul-day", event: "map_viewed" },
      {
        at: "2026-10-02T14:30:00Z",
        browser: "same-seoul-day",
        event: "place_opened",
        placeId: "p1",
      },
    ]
    expect(retention(events, "2026-10-01T00:00:00Z", "2026-10-15T15:30:00Z")).toEqual({
      immature: 0,
      matured: 1,
      returned: 0,
    })
  })

  it("keeps zero denominators unavailable in every saved query", () => {
    for (const { query } of readinessQueries.queries) {
      expect(query.query).toMatch(/if\([^)]*(?:events|browsers) = 0, null,/)
    }
  })
})
