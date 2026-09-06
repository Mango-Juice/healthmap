import {
  assertPrivateTransport,
  installAnalyticsInterceptor,
  waitForEvent,
} from "./analytics-transport"
import { registerDiscoveryAnalyticsAdversarialTests } from "./discovery-analytics-adversarial"
import { registerDiscoveryCatalogAnalyticsContractTest } from "./discovery-analytics-catalog-contract"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              accuracy: 20,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 37.57,
              longitude: 126.979,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: 0,
            toJSON: () => ({}),
          }),
      },
    })
  })
})

test("search analytics waits for success and deduplicates retry, equivalent text, and rerender", async ({
  page,
}) => {
  const transport = await installAnalyticsInterceptor(page)
  let failFirstSearch = true
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (
      failFirstSearch &&
      url.searchParams.get("mode") === "places" &&
      url.searchParams.get("query") === "무지개 한그릇 연구소"
    ) {
      failFirstSearch = false
      return route.fulfill({ status: 503, json: { error: "catalog_unavailable", retry: true } })
    }
    return route.continue()
  })
  await page.goto("/")
  await expect(page.locator("[data-food-map-place-id]").first()).toBeAttached()
  const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })

  await search.fill("무")
  await search.fill("무지개 한그릇 연구소")
  await expect(page.getByRole("button", { name: "장소 다시 불러오기" })).toBeVisible()
  expect(transport.events.filter(({ event }) => event === "search_used")).toHaveLength(0)
  await waitForEvent(transport.events, "catalog_request_failed", {
    query_kind: "search",
    reason: "http",
  })
  await page.getByRole("button", { name: "장소 다시 불러오기" }).click()
  await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
  await waitForEvent(transport.events, "search_used", { result_count_bucket: "1_5" })
  await search.fill("  무지개 한그릇 연구소  ")
  await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
  await page.setViewportSize({ width: 900, height: 800 })
  await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")

  expect(transport.events.filter(({ event }) => event === "search_used")).toHaveLength(1)
  await search.fill("샐러드")
  await expect
    .poll(() => transport.events.filter(({ event }) => event === "search_used").length)
    .toBe(2)
  await search.fill("")
  await search.fill("무지개 한그릇 연구소")
  await expect
    .poll(() => transport.events.filter(({ event }) => event === "search_used").length)
    .toBe(3)
  expect(transport.events.filter(({ event }) => event === "map_viewed")).toHaveLength(1)
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("native location failure is bounded and leaves search usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    })
  })
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/")

  await waitForEvent(transport.events, "location_resolved", { outcome: "denied" })
  await expect(page.getByRole("searchbox", { name: "가게나 메뉴 검색" })).toBeEnabled()
  await expect(page.locator("[data-food-map-place-id]").first()).toBeAttached()
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("map selection and an explicit moved-area commit emit only bounded actions", async ({
  page,
}) => {
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/")
  const marker = page.getByRole("button", { name: "구름 도시락 공방", exact: true })
  await expect(marker).toBeVisible()
  await marker.click()
  await expect.poll(() => transport.events.some(({ event }) => event === "place_opened")).toBe(true)
  const opened = transport.events.find(({ event }) => event === "place_opened")
  expect(opened?.properties["source"]).toBe("map")
  expect(opened?.properties["place_id"]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  )
  await page.keyboard.press("Escape")
  const mapStage = page.getByTestId("food-map-stage")
  const box = await mapStage.boundingBox()
  if (box === null) throw new TypeError("expected visible map stage")
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 30, box.y + 30)
  await page.mouse.up()
  const movement = await page.evaluate(() => {
    const maps: unknown = Reflect.get(window, "__healthMapTestMaps")
    if (!Array.isArray(maps)) return false
    const map: unknown = maps[0]
    if (typeof map !== "object" || map === null) return false
    const setTestBounds: unknown = Reflect.get(map, "setTestBounds")
    if (typeof setTestBounds !== "function") return false
    Reflect.apply(setTestBounds, map, [
      { latitude: 37.53, longitude: 126.94 },
      { latitude: 37.54, longitude: 126.95 },
    ])
    return true
  })
  expect(movement).toBe(true)
  const resultEventsBefore = transport.events.filter(
    ({ event }) => event === "catalog_result_received",
  ).length
  await page.getByRole("button", { name: "이 지역 재검색" }).click()
  await waitForEvent(transport.events, "search_area_applied", {})
  await expect
    .poll(() => transport.events.filter(({ event }) => event === "catalog_result_received").length)
    .toBe(resultEventsBefore + 1)
  expect(
    transport.events.filter(({ event }) => event === "catalog_result_received").at(-1)?.properties,
  ).toMatchObject({ query_kind: "browse", filter: "all" })
  assertPrivateTransport(transport.events, transport.rawRequests)
})

registerDiscoveryCatalogAnalyticsContractTest()
registerDiscoveryAnalyticsAdversarialTests()
