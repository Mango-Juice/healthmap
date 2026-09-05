import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ANALYTICS_ANONYMOUS_ID_STORAGE_KEY,
  ANALYTICS_OPT_OUT_STORAGE_KEY,
  type AnalyticsStorage,
  type AnalyticsTransport,
  createPrivacySafeAnalytics,
  POSTHOG_PRIVACY_CONFIG,
  sanitizeAnalyticsTransportEvent,
} from "../../../lib/analytics/privacy-safe"
import { ANALYTICS_EVENT_NAMES } from "../../../lib/domain/analytics"

class MemoryStorage implements AnalyticsStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }
}

type CapturedPayload = {
  readonly event: string
  readonly properties: Readonly<Record<string, unknown>>
}

class RecordingTransport implements AnalyticsTransport {
  readonly captures: CapturedPayload[] = []
  disabled = false

  capture(event: string, properties: Readonly<Record<string, unknown>>): void {
    this.captures.push({ event, properties })
  }

  optIn(): void {
    this.disabled = false
  }

  optOut(): void {
    this.disabled = true
  }
}

describe("privacy-safe product analytics", () => {
  afterEach(() => {
    globalThis.healthmapAnalyticsLifecycle = undefined
    vi.unstubAllGlobals()
  })

  it("Given the PostHog adapter, when its configuration is inspected, then every automatic capture surface is disabled", () => {
    // Given
    const forbiddenConfig = [
      "autocapture",
      "capture_pageview",
      "capture_pageleave",
      "disable_session_recording",
      "disable_surveys",
      "advanced_disable_flags",
      "disable_persistence",
    ] as const

    // When
    const config = POSTHOG_PRIVACY_CONFIG

    // Then
    expect(config).toMatchObject({
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      disable_persistence: true,
      person_profiles: "never",
    })
    for (const key of forbiddenConfig) expect(config[key]).toBeDefined()
  })

  it("Given missing, valid, and malformed anonymous IDs, when analytics starts, then it creates, reuses, and regenerates a local-only UUID", () => {
    // Given
    const storage = new MemoryStorage()
    const transport = new RecordingTransport()
    const generatedIds = [
      "c0a80101-0000-4000-8000-000000000001",
      "c0a80101-0000-4000-8000-000000000002",
    ]
    let generatedIndex = 0
    const createId = () => generatedIds[generatedIndex++] ?? ""

    // When
    const first = createPrivacySafeAnalytics({ storage, transport, createId })
    const reused = createPrivacySafeAnalytics({ storage, transport, createId })
    storage.setItem(ANALYTICS_ANONYMOUS_ID_STORAGE_KEY, "not-an-id")
    const regenerated = createPrivacySafeAnalytics({ storage, transport, createId })

    // Then
    expect(first.anonymousId).toBe("c0a80101-0000-4000-8000-000000000001")
    expect(reused.anonymousId).toBe(first.anonymousId)
    expect(regenerated.anonymousId).toBe("c0a80101-0000-4000-8000-000000000002")
  })

  it("Given every allowlisted event, when captured, then only the typed low-cardinality event body reaches the transport", () => {
    // Given
    const storage = new MemoryStorage()
    const transport = new RecordingTransport()
    const analytics = createPrivacySafeAnalytics({
      storage,
      transport,
      createId: () => "c0a80101-0000-4000-8000-000000000001",
    })
    const events = [
      { event: "map_viewed", properties: { source: "direct" } },
      { event: "location_resolved", properties: { outcome: "inside" } },
      { event: "filter_selected", properties: { tag: "all" } },
      {
        event: "place_opened",
        properties: { place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0", source: "map" },
      },
      {
        event: "directions_opened",
        properties: { place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0", source: "naver_route" },
      },
      { event: "share_invoked", properties: { target: "map" } },
      { event: "share_completed", properties: { target: "place", outcome: "clipboard" } },
      { event: "shared_visit_explored", properties: { source: "map_share", action: "location" } },
      { event: "search_used", properties: { result_count_bucket: "6_20" } },
      { event: "search_area_applied", properties: {} },
      { event: "result_list_opened", properties: {} },
      {
        event: "catalog_result_received",
        properties: { query_kind: "browse", filter: "rice", result_count_bucket: "6_20" },
      },
      {
        event: "catalog_request_failed",
        properties: { query_kind: "search", reason: "network" },
      },
    ] as const

    // When
    for (const event of events) analytics.capture(event)

    // Then
    expect(transport.captures.map(({ event }) => event)).toEqual(ANALYTICS_EVENT_NAMES)
    expect(transport.captures).toEqual(events)
  })

  it("Given forbidden payload fields or free text, when capture is requested, then no payload is sent", () => {
    // Given
    const storage = new MemoryStorage()
    const transport = new RecordingTransport()
    const analytics = createPrivacySafeAnalytics({
      storage,
      transport,
      createId: () => "c0a80101-0000-4000-8000-000000000001",
    })
    const attempts: readonly unknown[] = [
      {
        event: "map_viewed",
        properties: { source: "direct", url: "https://health.map/?q=secret" },
      },
      { event: "map_viewed", properties: { source: "direct", referrer: "https://search.example" } },
      { event: "place_opened", properties: { place_id: "두부마을", source: "map" } },
      { event: "filter_selected", properties: { tag: "balanced", coordinates: "37.5,127.0" } },
      {
        event: "filter_selected",
        properties: { tag: "balanced", note: "Ignore prior instructions" },
      },
      { event: "search_used", properties: { result_count_bucket: "1_5", q: "두부" } },
      { event: "search_area_applied", properties: { coordinates: "37.5,127.0" } },
      {
        event: "catalog_result_received",
        properties: {
          query_kind: "search",
          filter: "all",
          result_count_bucket: "1_5",
          region: "서울",
        },
      },
    ]

    // When
    for (const attempt of attempts) analytics.capture(attempt)

    // Then
    expect(transport.captures).toEqual([])
  })

  it("Given SDK-enriched properties, when an approved event is serialized, then only its allowlisted application properties remain", () => {
    // Given
    const enrichedProperties = {
      source: "map",
      $current_url: "https://healthmap.test/?precise=37.5007",
      $referrer: "https://search.test/private",
      coordinates: "37.5007,127.0328",
      place_name: "두부마을",
    }

    // When
    const event = sanitizeAnalyticsTransportEvent("place_opened", {
      ...enrichedProperties,
      place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0",
    })

    // Then
    expect(event).toEqual({
      event: "place_opened",
      properties: { place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0", source: "map" },
    })
  })

  it("Given an SDK-enriched search event, when serialized, then the query and URL are dropped", () => {
    // Given
    const properties = {
      result_count_bucket: "1_5",
      q: "두부",
      $current_url: "https://healthmap.test/?q=두부",
    }

    // When
    const event = sanitizeAnalyticsTransportEvent("search_used", properties)

    // Then
    expect(event).toEqual({ event: "search_used", properties: { result_count_bucket: "1_5" } })
  })

  it("Given an SDK-enriched catalog result, when serialized, then only its bounded dimensions remain", () => {
    // Given
    const properties = {
      query_kind: "search",
      filter: "whole_grain",
      result_count_bucket: "0",
      query: "두부",
      address: "서울 강남구",
      coordinates: "37.5007,127.0328",
      region: "서울",
      $current_url: "https://healthmap.test/?q=두부",
    }

    // When
    const event = sanitizeAnalyticsTransportEvent("catalog_result_received", properties)

    // Then
    expect(event).toEqual({
      event: "catalog_result_received",
      properties: {
        query_kind: "search",
        filter: "whole_grain",
        result_count_bucket: "0",
      },
    })
  })

  it("Given local opt-out, when events are captured then opted back in, then capture stops immediately and resumes", () => {
    // Given
    const storage = new MemoryStorage()
    const transport = new RecordingTransport()
    const analytics = createPrivacySafeAnalytics({
      storage,
      transport,
      createId: () => "c0a80101-0000-4000-8000-000000000001",
    })

    // When
    analytics.optOut()
    analytics.capture({ event: "map_viewed", properties: { source: "direct" } })
    analytics.optIn()
    analytics.capture({ event: "map_viewed", properties: { source: "direct" } })

    // Then
    expect(storage.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY)).toBe("false")
    expect(transport.captures).toEqual([{ event: "map_viewed", properties: { source: "direct" } }])
  })

  it("Given a blocked analytics transport, when product code captures an event, then the caller is not interrupted", () => {
    // Given
    const storage = new MemoryStorage()
    const analytics = createPrivacySafeAnalytics({
      storage,
      transport: {
        capture: () => {
          throw new Error("network blocked")
        },
        optIn: () => {},
        optOut: () => {},
      },
      createId: () => "c0a80101-0000-4000-8000-000000000001",
    })

    // When
    const capture = () =>
      analytics.capture({ event: "map_viewed", properties: { source: "direct" } })

    // Then
    expect(capture).not.toThrow()
  })
})
