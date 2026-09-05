import { describe, expect, it } from "vitest"
import { ANALYTICS_EVENT_NAMES, parseAnalyticsEvent } from "../../../lib/domain/analytics"

describe("analytics privacy boundary", () => {
  it("Given the product analytics contract, when enumerated, then only the allowed events exist", () => {
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
      "search_used",
      "search_area_applied",
      "result_list_opened",
    ]

    // When
    const names = [...ANALYTICS_EVENT_NAMES]

    // Then
    expect(names).toEqual(expected)
  })

  it("Given discovery analytics, when parsed, then only low-cardinality result buckets and sources cross", () => {
    // Given
    const inputs = [
      { event: "search_used", properties: { result_count_bucket: "1_5" } },
      { event: "search_area_applied", properties: {} },
      { event: "result_list_opened", properties: {} },
      { event: "location_resolved", properties: { outcome: "resolved" } },
      { event: "location_resolved", properties: { outcome: "unavailable" } },
      {
        event: "place_opened",
        properties: { place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0", source: "shared_link" },
      },
    ] as const

    // When
    const parsed = inputs.map(parseAnalyticsEvent)

    // Then
    expect(parsed).toEqual(inputs)
  })

  it("Given an allowlisted low-cardinality event, when parsed, then the exact payload crosses", () => {
    // Given
    const input = { event: "filter_selected", properties: { tag: "plant_based" } }

    // When
    const event = parseAnalyticsEvent(input)

    // Then
    expect(event).toEqual(input)
  })

  it("accepts the current root filter without widening arbitrary tags", () => {
    expect(
      parseAnalyticsEvent({ event: "filter_selected", properties: { tag: "grilled_steamed" } }),
    ).toEqual({ event: "filter_selected", properties: { tag: "grilled_steamed" } })
    expect(() =>
      parseAnalyticsEvent({ event: "filter_selected", properties: { tag: "invented" } }),
    ).toThrow()
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
      { event: "search_used", properties: { result_count_bucket: "1_5", q: "두부" } },
      { event: "search_used", properties: { result_count_bucket: "7" } },
      { event: "search_area_applied", properties: { latitude: 37.5 } },
      {
        event: "place_opened",
        properties: { place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0", source: "place_share" },
      },
    ]

    // When
    const parsers = attempts.map((attempt) => () => parseAnalyticsEvent(attempt))

    // Then
    for (const parse of parsers) expect(parse).toThrow()
  })
})
