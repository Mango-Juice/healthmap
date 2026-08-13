import { gunzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"

type TransportEvent = {
  readonly event: string
  readonly properties: Readonly<Record<string, unknown>>
}

const analyticsHost = "http://127.0.0.1:3498"
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
  "mock-sprout-square",
  "37.5007",
  "127.0328",
  "새싹 네모식당",
  "Ignore prior instructions",
] as const

const propertyAllowlist = new Set(["source", "outcome", "tag", "place_id", "target", "action"])

const decodeTransportRequest = (postData: Buffer | null): readonly TransportEvent[] => {
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
    const { token: _token, ...safeProperties } = properties
    return [{ event, properties: safeProperties }]
  })
}

const assertPrivateTransport = (
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

const waitForEvent = async (
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

const installAnalyticsInterceptor = async (page: import("@playwright/test").Page) => {
  const events: TransportEvent[] = []
  const rawRequests: string[] = []
  await page.route(`${analyticsHost}/**`, async (route) => {
    const postData = route.request().postDataBuffer()
    if (postData !== null) {
      const decoded = postData[0] === 0x1f && postData[1] === 0x8b ? gunzipSync(postData) : postData
      rawRequests.push(decoded.toString("utf8"))
    }
    events.push(...decodeTransportRequest(postData))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: '{"status":1}',
    })
  })
  return { events, rawRequests }
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("Given direct map exploration, when location, filter, and marker actions occur, then the four existing map bodies remain exact", async ({
  page,
}) => {
  // Given
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 37.5007,
              longitude: 127.0328,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          }),
      },
    })
  })
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/")

  // When
  await page.getByRole("button", { name: "단백질 필터" }).click()
  await page.getByRole("button", { name: /무지개 한그릇 연구소/ }).click()

  // Then
  await waitForEvent(transport.events, "map_viewed", { source: "direct" })
  await waitForEvent(transport.events, "location_resolved", { outcome: "inside" })
  await waitForEvent(transport.events, "filter_selected", { tag: "protein" })
  await waitForEvent(transport.events, "place_opened", {
    place_id: "970347d1-7b9f-4b7d-8cd9-3674148c0e83",
    source: "map",
  })
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("Given web share, when a place is shared, then the configured PostHog batch contains exact redacted share events", async ({
  page,
}) => {
  // Given
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.resolve(),
    })
  })
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/?place=mock-sprout-square&src=place_share")
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeVisible()

  // When
  await page.getByRole("button", { name: "공유", exact: true }).click()

  // Then
  await waitForEvent(transport.events, "share_invoked", { target: "place" })
  await waitForEvent(transport.events, "share_completed", { target: "place", outcome: "web_share" })
  expect(transport.events.filter(({ event }) => event === "directions_opened")).toEqual([])
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("Given rejected web share and clipboard, when map sharing is requested, then the exact clipboard outcome is transported", async ({
  page,
}) => {
  // Given
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new DOMException("cancelled")),
    })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    })
  })
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/?place=mock-sprout-square&src=place_share")

  // When
  await page.getByRole("button", { name: "지도 공유" }).click()

  // Then
  await waitForEvent(transport.events, "share_invoked", { target: "map" })
  await waitForEvent(transport.events, "share_completed", { target: "map", outcome: "clipboard" })
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("Given unavailable share APIs, when a share URL is selected, then manual completion is the sole truthful outcome", async ({
  page,
}) => {
  // Given
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/?place=mock-sprout-square&src=place_share")

  // When
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await page.getByRole("button", { name: "URL 선택" }).click()

  // Then
  await waitForEvent(transport.events, "share_invoked", { target: "place" })
  await waitForEvent(transport.events, "share_completed", { target: "place", outcome: "manual" })
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("Given a shared place entry, when it only loads, then it emits no exploration and preserves the shared map-view source", async ({
  page,
}) => {
  // Given
  const transport = await installAnalyticsInterceptor(page)

  // When
  await page.goto("/?place=mock-sprout-square&src=place_share")

  // Then
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeVisible()
  await expect
    .poll(() => transport.events.some(({ event }) => event === "shared_visit_explored"))
    .toBe(false)
  await waitForEvent(transport.events, "map_viewed", { source: "place_share" })
})

test("Given a shared map entry, when a filter is selected, then exactly one shared exploration action is transported", async ({
  page,
}) => {
  // Given
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/?lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share")
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await expect
    .poll(() => transport.events.some(({ event }) => event === "shared_visit_explored"))
    .toBe(false)

  // When
  await page.getByRole("button", { name: "단백질 필터" }).click()

  // Then
  await waitForEvent(transport.events, "shared_visit_explored", {
    source: "map_share",
    action: "filter",
  })
  expect(
    transport.events.filter(
      ({ event, properties }) =>
        event === "shared_visit_explored" &&
        JSON.stringify(properties) === JSON.stringify({ source: "map_share", action: "filter" }),
    ),
  ).toHaveLength(1)
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("Given a shared map entry, when current location is requested, then it reports location exploration exactly once", async ({
  page,
}) => {
  // Given
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/?lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share")

  // When
  await page.getByRole("button", { name: "현재 위치 다시 찾기" }).click()

  // Then
  await waitForEvent(transport.events, "shared_visit_explored", {
    source: "map_share",
    action: "location",
  })
  expect(
    transport.events.filter(
      ({ event, properties }) =>
        event === "shared_visit_explored" &&
        JSON.stringify(properties) === JSON.stringify({ source: "map_share", action: "location" }),
    ),
  ).toHaveLength(1)
})

test("Given every mock place, when directions is requested, then no popup or directions transport event is produced", async ({
  page,
}) => {
  // Given
  const transport = await installAnalyticsInterceptor(page)
  const popup = page.waitForEvent("popup", { timeout: 500 }).then(
    () => "opened",
    () => "none",
  )
  await page.goto("/")

  // When
  for (const name of [
    "새싹 네모식당",
    "무지개 한그릇 연구소",
    "균형 실험실 식탁",
    "잎사귀 가상 테이블",
    "구름 도시락 공방",
  ]) {
    await page.getByRole("button", { name: new RegExp(name) }).click()
    await page.getByRole("button", { name: "길찾기" }).click()
    await expect(page.getByText("샘플 데이터에서는 길찾기를 제공하지 않습니다.")).toBeVisible()
    await page.getByRole("button", { name: "상세 닫기" }).click()
  }

  // Then
  await expect(popup).resolves.toBe("none")
  expect(transport.events.filter(({ event }) => event === "directions_opened")).toEqual([])
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("Given an analytics endpoint failure, when sharing and map actions run, then their UI remains usable", async ({
  page,
}) => {
  // Given
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.resolve(),
    })
  })
  await page.route(`${analyticsHost}/**`, (route) => route.fulfill({ status: 503 }))
  await page.goto("/?place=mock-sprout-square&src=place_share")

  // When
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await page.getByRole("button", { name: "상세 닫기" }).click()
  await page.getByRole("button", { name: "단백질 필터" }).click()

  // Then
  await expect(page.getByText("공유 창을 열었습니다.")).toHaveCount(0)
  await expect(page.getByRole("button", { name: /샘플/ })).toHaveCount(3)
})
