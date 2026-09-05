import { gunzipSync } from "node:zlib"
import type { BrowserContext, Page } from "@playwright/test"
import { expect } from "./map-test"

export type TransportEvent = {
  readonly event: string
  readonly properties: Readonly<Record<string, unknown>>
}

export const analyticsHosts = ["http://127.0.0.1:3498", "https://127.0.0.1:4566/posthog"] as const

const forbiddenTransportText = [
  "$current_url",
  "$pathname",
  "$referrer",
  "$referring_domain",
  "coordinates",
  "address",
  "place_name",
  "menu",
  "referrer",
  "test-sprout-square",
  "37.5007",
  "127.0328",
  "새싹 네모식당",
  "Ignore prior instructions",
] as const

const propertyAllowlist = new Set([
  "source",
  "outcome",
  "tag",
  "place_id",
  "target",
  "action",
  "result_count_bucket",
  "query_kind",
  "filter",
  "reason",
])

export const parseAnalyticsTransportEvents = (
  postData: Buffer | null,
): readonly TransportEvent[] => {
  if (postData === null) return []
  const decoded = postData[0] === 0x1f && postData[1] === 0x8b ? gunzipSync(postData) : postData
  const parsed: unknown = JSON.parse(decoded.toString("utf8"))
  if (typeof parsed !== "object" || parsed === null) return []
  const batch = "batch" in parsed && Array.isArray(parsed.batch) ? parsed.batch : [parsed]
  return batch.flatMap((entry): readonly TransportEvent[] => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("event" in entry) ||
      !("properties" in entry)
    )
      return []
    const { event, properties } = entry
    if (typeof event !== "string" || typeof properties !== "object" || properties === null)
      return []
    const { $geoip_disable: _geoipDisabled, token: _token, ...safeProperties } = properties
    return [{ event, properties: safeProperties }]
  })
}

export const assertPrivateTransport = (
  events: readonly TransportEvent[],
  rawRequests: readonly string[],
): void => {
  for (const rawRequest of rawRequests) {
    for (const forbidden of forbiddenTransportText)
      expect(rawRequest.toLowerCase()).not.toContain(forbidden.toLowerCase())
  }
  for (const { properties } of events)
    expect(Object.keys(properties).every((key) => propertyAllowlist.has(key))).toBe(true)
}

export const waitForEvent = async (
  events: readonly TransportEvent[],
  event: string,
  properties: Readonly<Record<string, unknown>>,
): Promise<void> => {
  await expect
    .poll(() =>
      events.some(
        (entry) =>
          entry.event === event && JSON.stringify(entry.properties) === JSON.stringify(properties),
      ),
    )
    .toBe(true)
}

export const recordAnalyticsTransport = async (page: Page) => {
  const events: TransportEvent[] = []
  const rawRequests: string[] = []
  for (const analyticsHost of analyticsHosts) {
    await page.route(`${analyticsHost}/**`, async (route) => {
      const postData = route.request().postDataBuffer()
      if (postData !== null) {
        const decoded =
          postData[0] === 0x1f && postData[1] === 0x8b ? gunzipSync(postData) : postData
        rawRequests.push(decoded.toString("utf8"))
      }
      events.push(...parseAnalyticsTransportEvents(postData))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: '{"status":1}',
      })
    })
  }
  return { events, rawRequests }
}

export const installAnalyticsInterceptor = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("healthmap.analytics.opt-out.v1", "false")
  })
  return recordAnalyticsTransport(page)
}

export const disableGeolocation = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
}
