import { gunzipSync } from "node:zlib"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { captureProductAnalytics, initializeProductAnalytics } from "../../../lib/analytics/browser"
import {
  ANALYTICS_ANONYMOUS_ID_STORAGE_KEY,
  ANALYTICS_OPT_OUT_STORAGE_KEY,
  type AnalyticsStorage,
} from "../../../lib/analytics/privacy-safe"

const WirePayloadSchema = z
  .object({
    batch: z.array(
      z
        .object({
          distinct_id: z.uuid(),
          event: z.string(),
          properties: z.record(z.string(), z.unknown()),
        })
        .passthrough(),
    ),
  })
  .passthrough()

class MemoryStorage implements AnalyticsStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const installBrowserEnvironment = (storage: AnalyticsStorage): void => {
  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    document: { referrer: "https://referrer.test/private" },
    localStorage: storage,
    location: {
      host: "healthmap.test",
      href: "https://healthmap.test/?q=private",
      pathname: "/",
    },
    navigator: { userAgent: "TestBrowser", vendor: "TestVendor" },
    screen: { height: 800, width: 1280 },
  })
}

const initializeOptedInAnalytics = (storage: AnalyticsStorage): void => {
  storage.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, "false")
  initializeProductAnalytics({
    host: "http://127.0.0.1:3498",
    key: "unit-test-key",
    playwrightTest: "1",
    testAllowHttpLoopback: "1",
  })
}

const decodeRequestBody = async (body: unknown): Promise<string | null> => {
  if (typeof body === "string") return body
  if (!(body instanceof Blob)) return null
  const bytes = new Uint8Array(await body.arrayBuffer())
  return bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes).toString("utf8")
    : new TextDecoder().decode(bytes)
}

describe("actual PostHog SDK wire privacy", () => {
  afterEach(() => {
    globalThis.healthmapAnalyticsLifecycle = undefined
    vi.unstubAllGlobals()
  })

  it("Given explicit local opt-in, when the actual SDK starts, then its lifecycle is opted in", async () => {
    // Given
    const storage = new MemoryStorage()
    installBrowserEnvironment(storage)

    // When
    initializeOptedInAnalytics(storage)
    await Promise.resolve()

    // Then
    const client = globalThis.healthmapAnalyticsLifecycle?.client
    if (client === null || client === undefined) throw new Error("analytics client did not start")
    expect(client.optedOut).toBe(false)
  })

  it("Given SDK-enriched browser context, when an approved event reaches the actual SDK transport, then GeoIP stays disabled while sensitive values are absent", async () => {
    // Given
    const storage = new MemoryStorage()
    const outboundBodies: string[] = []
    installBrowserEnvironment(storage)
    vi.stubGlobal("fetch", async (...args: readonly unknown[]) => {
      const options = args[1]
      if (typeof options === "object" && options !== null && "body" in options) {
        const body = await decodeRequestBody(options.body)
        if (body !== null) outboundBodies.push(body)
      }
      return new Response('{"status":1}', { status: 200 })
    })
    initializeOptedInAnalytics(storage)
    await Promise.resolve()

    // When
    captureProductAnalytics({
      event: "place_opened",
      properties: { place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01", source: "map" },
    })
    const client = globalThis.healthmapAnalyticsLifecycle?.client
    if (client === null || client === undefined) throw new Error("analytics client did not start")
    await client.flush()

    // Then
    expect(outboundBodies).toHaveLength(1)
    const outbound = outboundBodies[0] ?? ""
    const payload = WirePayloadSchema.parse(JSON.parse(outbound))
    expect(payload.batch).toHaveLength(1)
    expect(payload.batch[0]).toMatchObject({
      distinct_id: storage.getItem(ANALYTICS_ANONYMOUS_ID_STORAGE_KEY),
      event: "place_opened",
      properties: {
        $geoip_disable: true,
        place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01",
        source: "map",
      },
    })
    expect(payload.batch[0]?.properties).toEqual({
      $geoip_disable: true,
      place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01",
      source: "map",
    })
    for (const sensitiveValue of [
      "$current_url",
      "$referrer",
      "?q=private",
      "referrer.test",
      "coordinates",
      "address",
      "menu",
      "37.5007",
      "127.0328",
    ])
      expect(outbound).not.toContain(sensitiveValue)
  })

  it("Given a completed catalog request, when the actual SDK sends it, then only bounded result fields cross the wire", async () => {
    // Given
    const storage = new MemoryStorage()
    const outboundBodies: string[] = []
    installBrowserEnvironment(storage)
    vi.stubGlobal("fetch", async (...args: readonly unknown[]) => {
      const options = args[1]
      if (typeof options === "object" && options !== null && "body" in options) {
        const body = await decodeRequestBody(options.body)
        if (body !== null) outboundBodies.push(body)
      }
      return new Response('{"status":1}', { status: 200 })
    })
    initializeOptedInAnalytics(storage)
    await Promise.resolve()

    // When
    captureProductAnalytics({
      event: "catalog_result_received",
      properties: { query_kind: "search", filter: "plant_based", result_count_bucket: "0" },
    })
    const client = globalThis.healthmapAnalyticsLifecycle?.client
    if (client === null || client === undefined) throw new Error("analytics client did not start")
    await client.flush()

    // Then
    expect(outboundBodies).toHaveLength(1)
    const payload = WirePayloadSchema.parse(JSON.parse(outboundBodies[0] ?? ""))
    expect(payload.batch[0]).toMatchObject({
      event: "catalog_result_received",
      properties: {
        $geoip_disable: true,
        query_kind: "search",
        filter: "plant_based",
        result_count_bucket: "0",
      },
    })
    expect(payload.batch[0]?.properties).toEqual({
      $geoip_disable: true,
      query_kind: "search",
      filter: "plant_based",
      result_count_bucket: "0",
    })
  })
})
