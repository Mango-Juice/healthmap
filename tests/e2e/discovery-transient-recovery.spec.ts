import { installAnalyticsInterceptor } from "./analytics-transport"
import { expect, test } from "./map-test"
import { installDiscoveryStartGeolocation } from "./test-geolocation"

test("first-entry 503s recover automatically while loading stays visible and analytics reports only success", async ({
  page,
}, testInfo) => {
  await installDiscoveryStartGeolocation(page)
  const transport = await installAnalyticsInterceptor(page)
  const requests = { places: 0, regions: 0 }
  let releaseRetry: (() => void) | undefined
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve
  })
  await page.route("**/api/places?**", async (route) => {
    const mode = new URL(route.request().url()).searchParams.get("mode")
    if (mode !== "places" && mode !== "regions") return route.continue()
    requests[mode] += 1
    if (requests[mode] === 1)
      return route.fulfill({
        status: 503,
        headers: { "Retry-After": "1" },
        json: { error: "catalog_unavailable", retry: true },
      })
    await retryGate
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")

  await expect.poll(() => requests).toEqual({ places: 2, regions: 2 })
  await expect(page.getByText("장소를 찾고 있어요.", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "장소 다시 불러오기" })).toHaveCount(0)
  expect(transport.events.filter(({ event }) => event === "catalog_request_failed")).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath("transient-recovery-loading.png") })

  releaseRetry?.()
  await expect(page.locator("[data-food-map-place-id]").first()).toBeVisible()
  await expect(page.getByText("장소를 찾고 있어요.", { exact: true })).toBeHidden()
  await expect
    .poll(() => transport.events.filter(({ event }) => event === "catalog_result_received").length)
    .toBe(1)
  expect(
    transport.events.find(({ event }) => event === "catalog_result_received")?.properties,
  ).toMatchObject({ query_kind: "browse", filter: "all" })
  expect(transport.events.filter(({ event }) => event === "catalog_request_failed")).toHaveLength(0)
  expect(requests).toEqual({ places: 2, regions: 2 })
  await page.screenshot({ path: testInfo.outputPath("transient-recovery-results.png") })
})

test("a first-entry network failure recovers without a manual retry", async ({ page }) => {
  await installDiscoveryStartGeolocation(page)
  let placeRequests = 0
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "places")
      return route.continue()
    placeRequests += 1
    if (placeRequests === 1) return route.abort("failed")
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")

  await expect(page.locator("[data-food-map-place-id]").first()).toBeVisible()
  await expect(page.getByRole("button", { name: "장소 다시 불러오기" })).toHaveCount(0)
  expect(placeRequests).toBe(2)
})

test("transient detail failure keeps the known summary and loading visible until recovery", async ({
  page,
}) => {
  await installDiscoveryStartGeolocation(page)
  let detailRequests = 0
  let releaseRetry: (() => void) | undefined
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve
  })
  await page.route("**/api/places/*", async (route) => {
    detailRequests += 1
    if (detailRequests === 1)
      return route.fulfill({ status: 503, json: { error: "catalog_unavailable", retry: true } })
    await retryGate
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await page.locator("[data-food-map-place-id]").first().click()

  await expect.poll(() => detailRequests).toBe(2)
  const loading = page.getByText("상세 정보를 확인하고 있어요.", { exact: true })
  await expect(loading).toBeVisible()
  await expect(page.getByRole("button", { name: "장소에서 돌아가기" })).toBeVisible()
  await expect(page.getByRole("button", { name: "상세 정보 다시 불러오기" })).toHaveCount(0)

  releaseRetry?.()
  await expect(loading).toBeHidden()
  await expect(page.getByRole("region", { name: "조건에 맞는 메뉴", exact: true })).toBeVisible()
  expect(detailRequests).toBe(2)
})
