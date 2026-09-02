import { e2eCatalog } from "../fixtures/e2e-catalog"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
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
})

for (const scenario of [
  { name: "denied", code: 1 },
  { name: "timeout", code: 3 },
] as const) {
  test(`keeps the current map view for ${scenario.name} location`, async ({ page }) => {
    await page.addInitScript(({ code }) => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (
            _success: PositionCallback,
            failure: PositionErrorCallback,
            options?: PositionOptions,
          ) => {
            sessionStorage.setItem("geo-options", JSON.stringify(options))
            failure({
              code,
              message: "test",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            })
          },
        },
      })
    }, scenario)
    await page.goto("/")
    await expect(page.locator(`[data-location-state="${scenario.name}"]`)).toBeVisible()
    await expect(page.getByTestId("map-view")).toContainText("37.5007, 127.0328")
    await expect(page.getByRole("img", { name: "내 위치" })).toHaveCount(0)
  })
}
test("keeps the current map view when geolocation is unsupported", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined })
  })
  await page.goto("/")
  await expect(page.locator('[data-location-state="unsupported"]')).toBeVisible()
  await expect(page.getByTestId("map-view")).toContainText("37.5007, 127.0328")
})
test("covers every filter and keyboard marker selection", async ({ page }) => {
  await page.goto("/")
  for (const [label, count] of [
    ["채소", 4],
    ["단백질", 3],
    ["균형식", 5],
    ["식물성", 2],
    ["전체", 5],
  ] as const) {
    await page.getByRole("button", { name: `${label} 필터` }).click()
    await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(count)
  }
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })
  await marker.focus()
  await expect(marker).toBeFocused()
  await marker.press("Enter")
  await expect(page.getByText("장소를 선택했습니다.")).toBeVisible()
})
test("constructs a NAVER map after SDK failure and retry", async ({ page }) => {
  let attempts = 0
  await page.route("https://oapi.map.naver.com/**", async (route) => {
    attempts += 1
    if (attempts === 1) return route.abort()
    await route.fulfill({
      contentType: "text/javascript",
      body: `(()=>{class LatLng{}class Map{constructor(el){this.el=el;el.innerHTML='<canvas data-fake-naver-map width="20" height="20"></canvas>'}setCenter(){}setZoom(){}destroy(){}}class Marker{constructor({map,title}){this.el=document.createElement('button');this.el.type='button';this.el.setAttribute('aria-label',title);map.el.append(this.el)}setMap(map){if(map===null)this.el.remove()}}const Event={addListener(target,name,listener){if(name==='tilesloaded')queueMicrotask(listener);if(name==='click'&&target.el)target.el.addEventListener('click',listener);return{target,name,listener}},removeListener(){}};window.naver={maps:{LatLng,Map,Marker,Event}}})()`,
    })
  })
  await page.goto("/")
  await expect(page.getByText("NAVER 지도를 불러올 수 없습니다.")).toBeVisible()
  await page.getByRole("button", { name: "다시 시도" }).click()
  await expect(page.getByTestId("map-stage")).toHaveAttribute("data-adapter-state", "ready")
  await expect(page.locator("canvas[data-fake-naver-map]")).toBeVisible()
})
test("recovers catalog failure and supports empty catalog", async ({ page }) => {
  let attempts = 0
  await page.route("**/api/map-catalog", async (route) => {
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503 })
    if (attempts === 2)
      return route.fulfill({
        contentType: "application/json",
        body: '{"catalogVersion":"empty-e2e","dataMode":"production","menus":[],"places":[]}',
      })
    await route.fulfill({ contentType: "application/json", json: e2eCatalog })
  })
  await page.goto("/")
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await page.getByRole("button", { name: /다시 시도/ }).click()
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
})
test("keeps map markers interactive while catalog refresh loads or fails", async ({ page }) => {
  // Given
  const requests: import("@playwright/test").Route[] = []
  await page.route("**/api/map-catalog", async (route) => {
    requests.push(route)
  })
  await page.goto("/")

  // When
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(1)

  // Then
  await expect(page.getByText("장소 데이터를 불러오는 중입니다.")).toBeVisible()
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })
  await expect(marker).toBeVisible()
  await marker.press("Enter")
  await expect(page.getByText("장소를 선택했습니다.")).toBeVisible()
  await requests[0]?.fulfill({ status: 503 })
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await expect(marker).toBeVisible()
})
test("rejects malformed catalog and ignores stale rapid refresh", async ({ page }) => {
  const requests: import("@playwright/test").Route[] = []
  await page.route("**/api/map-catalog", async (route) => {
    requests.push(route)
  })
  await page.goto("/")
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(2)
  await requests[1]?.fulfill({
    contentType: "application/json",
    body: '{"catalogVersion":"empty-e2e","dataMode":"production","menus":[],"places":[]}',
  })
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await requests[0]?.fulfill({ status: 503 })
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toHaveCount(0)
})
