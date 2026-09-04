import { writeFile } from "node:fs/promises"
import { expect, serverTest as test } from "../e2e/map-test"

test("shared v2 map bootstrap pages with the identical query identity", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({
            code: 1,
            message: "fixture denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    }),
  )
  await page.goto("/?q=&tag=main_dish&lat=35.1&lng=129.03&z=15&ingredient=fish&cooking=grilled")
  const rows = page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem")
  await expect(rows).toHaveCount(50)
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/map-catalog/query?") && response.url().includes("cursor="),
  )
  await page.getByRole("button", { name: /더 보기/ }).click()
  const response = await responsePromise
  const body: unknown = await response.json()
  await writeFile(
    ".omo/evidence/task7-query/cursor-fix/browser-response.json",
    JSON.stringify({ url: response.url(), status: response.status(), body }, null, 2),
  )
  expect(response.status()).toBe(200)
  await expect(rows).toHaveCount(55)
  const labels = await rows
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))
  expect(new Set(labels).size).toBe(55)
  await expect(page.getByRole("button", { name: /더 보기/ })).toHaveCount(0)
  await page.getByRole("button", { name: "공개 쿼리 시험 0 상세 보기", exact: true }).click()
  await expect(page.getByTestId("place-detail")).toBeVisible()
  await page.goBack()
  await expect(rows).toHaveCount(55)
  await page.goForward()
  await expect(page.getByTestId("place-detail")).toBeVisible()
  await page.goBack()
  await expect(rows).toHaveCount(55)
  await page.screenshot({ path: ".omo/evidence/task7-query/cursor-fix/browser-page.png" })
})

test("granted location preserves the canonical shared area until an explicit location request", async ({
  page,
  context,
}) => {
  // Given: the visitor is in Seoul but opens a canonical Busan menu search.
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              latitude: 37.5,
              longitude: 127.03,
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          }),
      },
    }),
  )
  const shared = "/?q=&tag=main_dish&lat=35.1&lng=129.03&z=15&ingredient=fish&cooking=grilled"
  await page.goto(shared)
  await expect(page.locator('[data-location-state="inside"]')).toBeAttached()
  // When: refreshing the shared search after automatic location resolution.
  const refreshed = page.waitForResponse((response) =>
    response.url().includes("/api/map-catalog/query?"),
  )
  await page.getByRole("button", { name: "장소 새로고침", exact: true }).click()
  const query = new URL((await refreshed).url()).searchParams
  // Then: view, query bounds, results and canonical URL remain Busan.
  expect(Number(query.get("south"))).toBeCloseTo(35.06)
  expect(Number(query.get("north"))).toBeCloseTo(35.14)
  await expect(page.getByTestId("map-view")).toContainText("35.1000, 129.0300")
  await expect(page).toHaveURL(`http://127.0.0.1:4529${shared}`)
  await expect(
    page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem"),
  ).toHaveCount(50)
  await page.screenshot({ path: ".omo/evidence/task7-ui/granted-shared-area.png" })
  // Explicit location remains an intentional way to change areas.
  const located = page.waitForResponse(
    (response) =>
      response.url().includes("/api/map-catalog/query?") &&
      new URL(response.url()).searchParams.get("south") === "37.46",
  )
  await page.getByRole("button", { name: "현재 위치 다시 찾기", exact: true }).click()
  expect((await located).status()).toBe(200)
  await expect(page.getByTestId("map-view")).toContainText("37.5000, 127.0300")
  await expect(page.getByRole("list", { name: "검색 결과", exact: true })).toHaveCount(0)
})
