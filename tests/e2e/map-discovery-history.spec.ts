import type { Page } from "@playwright/test"
import { e2eCatalog } from "../fixtures/e2e-catalog"
import { expect, test } from "./map-test"

const readNativeTestMapView = async (page: Page) =>
  page.evaluate(() => {
    const maps: unknown = Reflect.get(window, "__healthMapTestMaps")
    if (!Array.isArray(maps)) return undefined
    const map: unknown = maps.at(-1)
    if (typeof map !== "object" || map === null) return undefined
    const getCenter: unknown = Reflect.get(map, "getCenter")
    const getZoom: unknown = Reflect.get(map, "getZoom")
    if (typeof getCenter !== "function" || typeof getZoom !== "function") return undefined
    const center: unknown = Reflect.apply(getCenter, map, [])
    if (typeof center !== "object" || center === null) return undefined
    const getLatitude: unknown = Reflect.get(center, "lat")
    const getLongitude: unknown = Reflect.get(center, "lng")
    if (typeof getLatitude !== "function" || typeof getLongitude !== "function") return undefined
    const latitude: unknown = Reflect.apply(getLatitude, center, [])
    const longitude: unknown = Reflect.apply(getLongitude, center, [])
    const zoom: unknown = Reflect.apply(getZoom, map, [])
    if (typeof latitude !== "number" || typeof longitude !== "number" || typeof zoom !== "number")
      return undefined
    return { latitude, longitude, zoom }
  })

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

test("Given duplicate or partial canonical query values, when discovery loads, then it safely recovers to the root map", async ({
  page,
}) => {
  // Given
  const malformedPaths = [
    "/?q=%EC%83%88%EC%8B%B9&q=%EB%91%90%EB%B6%80&tag=vegetables&lat=37.501&lng=127.033&z=15",
    "/?q=%EC%83%88%EC%8B%B9&tag=vegetables&lat=37.501&lng=127.033",
    "/?q=&tag=all&lat=0&lng=0&z=15",
    "/?q=&tag=all&lat=37.4919&lng=127.02&z=15",
  ] as const

  // When
  for (const malformedPath of malformedPaths) {
    await page.goto(malformedPath)

    // Then
    await expect(page).toHaveURL("/")
    await expect(page.getByRole("searchbox", { name: "장소와 메뉴 검색" })).toHaveValue("")
    await expect(page.getByRole("button", { name: "전체 필터" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await expect(page.getByTestId("map-view")).toContainText("37.5007, 127.0328 · 확대 15")
  }
})
test("Manual QA: Given a canonical discovery URL, when list Back and marker Escape close detail, then the exact map state is restored", async ({
  page,
}, testInfo) => {
  // Given
  const canonicalPath = "/?q=%EC%83%88%EC%8B%B9&tag=vegetables&lat=37.501&lng=127.033&z=15"
  await page.goto(canonicalPath)
  const search = page.getByRole("searchbox", { name: "장소와 메뉴 검색" })
  const vegetables = page.getByRole("button", { name: "채소 필터" })
  const result = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })

  // When
  await result.click()
  await page.goBack()

  // Then
  await expect(page).toHaveURL(canonicalPath)
  await expect(result).toBeFocused()

  // When
  await marker.focus()
  await marker.press("Enter")
  await page.keyboard.press("Escape")

  // Then
  await expect(page).toHaveURL(canonicalPath)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(marker).toBeFocused()
  await expect(search).toHaveValue("새싹")
  await expect(vegetables).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(() => readNativeTestMapView(page))
    .toEqual({ latitude: 37.501, longitude: 127.033, zoom: 15 })
  await expect(page.getByTestId("map-view")).toContainText("37.5010, 127.0330 · 확대 15")
  await page.screenshot({
    path: testInfo.outputPath("manual-canonical-history.png"),
    fullPage: true,
  })
  const state = {
    canonicalPath,
    detailCount: await page.getByTestId("place-detail").count(),
    focusedElement: await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    nativeMapView: await readNativeTestMapView(page),
    mapView: await page.getByTestId("map-view").textContent(),
    searchValue: await search.inputValue(),
    url: new URL(page.url()).pathname + new URL(page.url()).search,
    vegetablesPressed: await vegetables.getAttribute("aria-pressed"),
  }
  await testInfo.attach("canonical-history-state", {
    body: Buffer.from(JSON.stringify(state, null, 2)),
    contentType: "application/json",
  })
})
test("shows verified evidence and direct confirmation while excluding expired menus", async ({
  page,
}) => {
  const validMenu = e2eCatalog.menus[0]
  await page.route("**/api/map-catalog", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        ...e2eCatalog,
        menus: [
          ...e2eCatalog.menus,
          {
            ...validMenu,
            id: "10000000-0000-4000-8000-000000000011",
            name: "현장 확인 채소 접시",
            evidenceUrl: null,
            verificationMethod: "direct_confirmation",
          },
          {
            ...validMenu,
            id: "10000000-0000-4000-8000-000000000012",
            name: "만료된 메뉴",
            verifiedAt: "2000-01-01",
            validUntil: "2000-02-01",
          },
        ],
      },
    })
  })
  await page.goto("/")
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()

  const detail = page.getByTestId("place-detail")
  await expect(detail.getByText("초록 그릇", { exact: true })).toBeVisible()
  await expect(detail.getByRole("link", { name: "검증 근거 보기" }).first()).toBeVisible()
  await expect(detail.getByRole("link", { name: "NAVER 장소 정보 보기" })).toHaveCount(0)
  await expect(detail.getByText("현장 확인 채소 접시", { exact: true })).toBeVisible()
  await expect(detail.getByText("직접 확인 기록", { exact: true })).toBeVisible()
  await expect(detail.getByText("만료된 메뉴", { exact: true })).toHaveCount(0)
})
test("shows an inside location and allows explicit retry", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-location-state="inside"]')).toBeVisible()
  await page.getByRole("button", { name: "현재 위치 다시 찾기" }).click()
  await expect(page.locator('[data-location-state="inside"]')).toBeVisible()
})
test("shows requesting while geolocation is pending", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
  await page.goto("/")
  await expect(page.locator('[data-location-state="requesting"]')).toContainText("현재 위치를 확인")
  await expect(page.getByTestId("map-view")).toContainText("37.5007, 127.0328")
})
for (const scenario of [
  { name: "southwest boundary", latitude: 37.482, longitude: 127.01, state: "inside" },
  { name: "northeast boundary", latitude: 37.5185, longitude: 127.0545, state: "inside" },
  { name: "outside", latitude: 37.6, longitude: 127.1, state: "outside" },
] as const) {
  test(`resolves ${scenario.name} location and preserves the location contract`, async ({
    page,
  }) => {
    await page.addInitScript(({ latitude, longitude }) => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (
            success: PositionCallback,
            _failure: PositionErrorCallback,
            options?: PositionOptions,
          ) => {
            sessionStorage.setItem("geo-options", JSON.stringify(options))
            success({
              coords: {
                accuracy: 1,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                latitude,
                longitude,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            })
          },
        },
      })
    }, scenario)
    await page.goto("/")
    await expect(page.locator(`[data-location-state="${scenario.state}"]`)).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem("geo-options"))).toBe(
      '{"enableHighAccuracy":false,"timeout":5000,"maximumAge":300000}',
    )
    if (scenario.state === "outside") {
      await expect(page.getByTestId("map-view")).toContainText("37.5007, 127.0328")
      await expect(page.getByRole("img", { name: "내 위치" })).toHaveCount(0)
    }
  })
}
