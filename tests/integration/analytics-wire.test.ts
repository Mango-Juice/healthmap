import { createServer } from "node:http"
import { gunzipSync } from "node:zlib"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { captureProductAnalytics, initializeProductAnalytics } from "../../lib/analytics/browser"
import {
  ANALYTICS_ANONYMOUS_ID_STORAGE_KEY,
  ANALYTICS_OPT_OUT_STORAGE_KEY,
  type AnalyticsStorage,
} from "../../lib/analytics/privacy-safe"

const WirePayloadSchema = z.object({
  batch: z.array(
    z.object({
      distinct_id: z.uuid(),
      event: z.literal("place_opened"),
      properties: z.record(z.string(), z.unknown()),
    }),
  ),
})

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
    navigator: { userAgent: "SensitiveBrowser", vendor: "SensitiveVendor" },
    screen: { height: 800, width: 1280 },
  })
}

describe("actual PostHog HTTP transport", () => {
  afterEach(() => {
    globalThis.healthmapAnalyticsLifecycle = undefined
    vi.unstubAllGlobals()
  })

  it("Given a bounded local capture endpoint, when one approved event flushes, then one privacy-safe wire request arrives", async () => {
    // Given
    const chunks: Buffer[] = []
    let requestCount = 0
    let resolveRequest: (() => void) | undefined
    const requestReceived = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    const server = createServer((request, response) => {
      requestCount += 1
      request.on("data", (chunk: unknown) => {
        if (Buffer.isBuffer(chunk)) chunks.push(chunk)
      })
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" })
        response.end('{"status":1}')
        resolveRequest?.()
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    if (typeof address !== "object" || address === null)
      throw new TypeError("Capture server did not receive a TCP port")
    const storage = new MemoryStorage()
    installBrowserEnvironment(storage)
    storage.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, "false")
    let wireEvidence:
      | {
          readonly distinctIdMatchesLocal: boolean
          readonly event: string
          readonly forbiddenMatches: readonly string[]
          readonly properties: Readonly<Record<string, unknown>>
          readonly requestCount: number
        }
      | undefined

    try {
      initializeProductAnalytics({
        host: `http://127.0.0.1:${address.port}`,
        key: "integration-public-key",
        playwrightTest: "1",
        testAllowHttpLoopback: "1",
      })
      await Promise.resolve()

      // When
      captureProductAnalytics({
        event: "place_opened",
        properties: { place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01", source: "map" },
      })
      const client = globalThis.healthmapAnalyticsLifecycle?.client
      if (client === null || client === undefined) throw new Error("analytics client did not start")
      await client.flush()
      await requestReceived

      // Then
      expect(requestCount).toBe(1)
      const encoded = Buffer.concat(chunks)
      const decoded = encoded[0] === 0x1f && encoded[1] === 0x8b ? gunzipSync(encoded) : encoded
      const payload = WirePayloadSchema.parse(JSON.parse(decoded.toString("utf8")))
      expect(payload.batch).toHaveLength(1)
      expect(payload.batch[0]).toEqual(
        expect.objectContaining({
          distinct_id: storage.getItem(ANALYTICS_ANONYMOUS_ID_STORAGE_KEY),
          event: "place_opened",
          properties: {
            $geoip_disable: true,
            place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2e01",
            source: "map",
          },
        }),
      )
      const serialized = decoded.toString("utf8")
      for (const forbidden of [
        "$browser",
        "$current_url",
        "$device",
        "$device_id",
        "$host",
        "$os",
        "$pathname",
        "$referrer",
        "$session_id",
        "$window_id",
        "?q=private",
        "SensitiveBrowser",
        "SensitiveVendor",
        "coordinates",
        "address",
        "menu",
        "37.5007",
        "127.0328",
      ])
        expect(serialized).not.toContain(forbidden)
      wireEvidence = {
        distinctIdMatchesLocal:
          payload.batch[0]?.distinct_id === storage.getItem(ANALYTICS_ANONYMOUS_ID_STORAGE_KEY),
        event: payload.batch[0]?.event ?? "",
        forbiddenMatches: [],
        properties: payload.batch[0]?.properties ?? {},
        requestCount,
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    }
    expect(server.listening).toBe(false)
    if (wireEvidence === undefined) throw new TypeError("Wire evidence was not captured")
    process.stdout.write(`ANALYTICS_WIRE_EVIDENCE ${JSON.stringify(wireEvidence)}\n`)
  })
})
