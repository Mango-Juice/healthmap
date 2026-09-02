import {
  assertPrivateTransport,
  disableGeolocation,
  installAnalyticsInterceptor,
  waitForEvent,
} from "./analytics-transport"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await disableGeolocation(context)
})

test("Given a canonical shared place, when it loads and is shared, then the absolute URL and source are exact", async ({
  page,
}, testInfo) => {
  // Given
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: ({ url }: ShareData) => {
        sessionStorage.setItem("captured-share-url", String(url))
        return Promise.resolve()
      },
    })
  })
  const transport = await installAnalyticsInterceptor(page)

  // When
  await page.goto("/places/test-sprout-square")
  const expectedOrigin = new URL(page.url()).origin
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeVisible()
  await page.getByRole("button", { name: "공유", exact: true }).click()
  const screenshotPath = testInfo.outputPath("shared-place-1280.png")
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach("shared-place", { path: screenshotPath, contentType: "image/png" })

  // Then
  await expect(page).toHaveURL("/places/test-sprout-square")
  expect(await page.evaluate(() => sessionStorage.getItem("captured-share-url"))).toBe(
    `${expectedOrigin}/places/test-sprout-square`,
  )
  await waitForEvent(transport.events, "place_opened", {
    place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0",
    source: "shared_link",
  })
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("Given canonical discovery state, when the map is shared, then only the absolute canonical map query is shared", async ({
  page,
}) => {
  // Given
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: ({ url }: ShareData) => {
        sessionStorage.setItem("captured-map-url", String(url))
        return Promise.resolve()
      },
    })
  })
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/?q=%EC%83%88%EC%8B%B9&tag=vegetables&lat=37.501&lng=127.033&z=15")
  const expectedOrigin = new URL(page.url()).origin

  // When
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await page.getByRole("button", { name: "지도 공유" }).click()

  // Then
  expect(await page.evaluate(() => sessionStorage.getItem("captured-map-url"))).toBe(
    `${expectedOrigin}/?q=%EC%83%88%EC%8B%B9&tag=vegetables&lat=37.501&lng=127.033&z=15`,
  )
  await waitForEvent(transport.events, "place_opened", {
    place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0",
    source: "list",
  })
  await waitForEvent(transport.events, "share_completed", { target: "map", outcome: "web_share" })
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
  await page.goto("/places/test-sprout-square")
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
  await page.goto("/places/test-sprout-square")

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
  await page.goto("/places/test-sprout-square")

  // When
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await page.getByRole("button", { name: "URL 선택" }).click()

  // Then
  await waitForEvent(transport.events, "share_invoked", { target: "place" })
  await waitForEvent(transport.events, "share_completed", { target: "place", outcome: "manual" })
  assertPrivateTransport(transport.events, transport.rawRequests)
})
