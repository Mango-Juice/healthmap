import { expect, test } from "@playwright/test"

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

test("renders the fallback-first five-place discovery shell", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("샘플 데이터", { exact: true })).toBeVisible()
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await expect(page.getByRole("button", { name: /샘플/ })).toHaveCount(5)
  await expect(page.getByTestId("map-view")).toContainText("37.5007, 127.0328 · 확대 15")
  await expect(page.getByRole("searchbox")).toHaveCount(0)
  await expect(page.getByRole("list")).toHaveCount(0)
})

test("filters by included tags, resets, and signals marker selection", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "단백질 필터" }).click()
  await expect(page.getByRole("button", { name: /샘플/ })).toHaveCount(3)
  await page.getByRole("button", { name: "식물성 필터" }).click()
  await expect(page.getByRole("button", { name: /샘플/ })).toHaveCount(2)
  await page.getByRole("button", { name: "전체 필터" }).click()
  await expect(page.getByRole("button", { name: /샘플/ })).toHaveCount(5)
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await expect(page.getByText("장소를 선택했습니다.")).toBeVisible()
})

test("shows an inside location and allows explicit retry", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-location-state="inside"]')).toBeVisible()
  await expect(page.getByRole("img", { name: "내 위치" })).toBeVisible()
  await page.getByRole("button", { name: "현재 위치 다시 찾기" }).click()
  await expect(page.locator('[data-location-state="inside"]')).toBeVisible()
})

test("constructs a NAVER map after SDK failure and retry", async ({ page }) => {
  let attempts = 0
  await page.route("https://oapi.map.naver.com/**", async (route) => {
    attempts += 1
    if (attempts === 1) return route.abort()
    await route.fulfill({
      contentType: "text/javascript",
      body: `window.naver={maps:{LatLng:class{},Map:class{constructor(el){el.innerHTML='<canvas data-fake-naver-map width="20" height="20"></canvas>'}setCenter(){}setZoom(){}destroy(){}}}}`,
    })
  })
  await page.goto("/")
  await expect(page.getByText("NAVER 지도를 불러오지 못했습니다.")).toBeVisible()
  await page.getByRole("button", { name: "지도 다시 시도" }).click()
  await expect(page.getByTestId("map-stage")).toHaveAttribute("data-adapter-state", "ready")
  await expect(page.locator("canvas[data-fake-naver-map]")).toBeVisible()
})

test("recovers catalog failure and supports empty catalog", async ({ page }) => {
  let attempts = 0
  await page.route("**/api/map-catalog", async (route) => {
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503 })
    if (attempts === 2)
      return route.fulfill({ contentType: "application/json", body: '{"places":[]}' })
    await route.continue()
  })
  await page.goto("/")
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await page.getByRole("button", { name: /다시 시도/ }).click()
  await expect(page.getByText("표시할 샘플 장소가 없습니다.")).toBeVisible()
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect(page.getByRole("button", { name: /샘플/ })).toHaveCount(5)
})
