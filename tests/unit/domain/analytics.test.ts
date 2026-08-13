import { describe, expect, it } from "vitest"
import { ANALYTICS_EVENT_NAMES, parseAnalyticsEvent } from "../../../lib/domain/analytics"

describe("analytics privacy boundary", () => {
  it("Given the product analytics contract, when enumerated, then only the eight allowed events exist", () => {
    // Given
    const expected = [
      "map_viewed",
      "location_resolved",
      "filter_selected",
      "place_opened",
      "directions_opened",
      "share_invoked",
      "share_completed",
      "shared_visit_explored",
    ]

    // When
    const names = [...ANALYTICS_EVENT_NAMES]

    // Then
    expect(names).toEqual(expected)
  })

  it("Given an allowlisted low-cardinality event, when parsed, then the exact payload crosses", () => {
    // Given
    const input = { event: "filter_selected", properties: { tag: "plant_based" } }

    // When
    const event = parseAnalyticsEvent(input)

    // Then
    expect(event).toEqual(input)
  })

  it("Given unknown keys or forbidden sensitive values, when parsed, then the payload is rejected", () => {
    // Given
    const attempts: readonly unknown[] = [
      { event: "filter_selected", properties: { tag: "balanced", query: "?lat=37.5007" } },
      { event: "map_viewed", properties: { source: "direct", url: "https://x.test/?secret=1" } },
      { event: "map_viewed", properties: { source: "direct", referrer: "https://search.test" } },
      { event: "place_opened", properties: { place_id: "37.5007,127.0328", source: "map" } },
      { event: "place_opened", properties: { place_id: "두부마을", source: "map" } },
      { event: "share_completed", properties: { target: "map", outcome: "copied 서울 강남구" } },
      { event: "unknown_event", properties: {} },
    ]

    // When
    const parsers = attempts.map((attempt) => () => parseAnalyticsEvent(attempt))

    // Then
    for (const parse of parsers) expect(parse).toThrow()
  })
})
