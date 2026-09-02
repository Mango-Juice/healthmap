import type { Page } from "@playwright/test"
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

test("renders one result set as a searchable list and native markers", async ({ page }) => {
  // Given
  await page.goto("/")

  // When
  const search = page.getByRole("searchbox", { name: "장소와 메뉴 검색" })
  await search.fill("초록 그릇")

  // Then
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("1곳")
  await expect(page.getByRole("list", { name: "검색 결과" }).getByRole("listitem")).toHaveCount(1)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(1)
  await expect(
    page.locator(
      '[data-test-naver-marker="true"][data-latitude="37.5007"][data-longitude="127.0328"]',
    ),
  ).toHaveCount(1)
  await expect(page.getByTestId("map-view")).toContainText("37.5007, 127.0328 · 확대 15")
})
test("combines normalized neighborhood search and one health tag", async ({ page }) => {
  // Given
  await page.goto("/")

  // When
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).fill("  서울   강남구  ")
  await page.getByRole("button", { name: "식물성 필터" }).click()

  // Then
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("2곳")
  await expect(page.getByRole("list", { name: "검색 결과" }).getByRole("listitem")).toHaveCount(2)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(2)
})
test("closes a list-selected detail when the committed filter excludes that place", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await page.getByRole("button", { name: "무지개 한그릇 연구소 상세 보기" }).click()
  await expect(page.getByRole("heading", { name: "무지개 한그릇 연구소" })).toBeVisible()

  // When
  await page.getByRole("button", { name: "채소 필터" }).click()

  // Then
  await expect(page.getByRole("heading", { name: "무지개 한그릇 연구소" })).toBeHidden()
  await expect(page.getByRole("button", { name: "채소 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("4곳")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(4)
  await expect(page).toHaveURL("/")
})
test("keeps a canonical shared detail available when the current filter excludes it", async ({
  page,
}) => {
  // Given
  await page.goto("/places/test-rainbow-bowl")
  const detailHeading = page.getByRole("heading", { name: "무지개 한그릇 연구소" })
  await expect(detailHeading).toBeVisible()

  // When
  await page.getByRole("button", { name: "채소 필터" }).click()

  // Then
  await expect(detailHeading).toBeVisible()
  await expect(page.getByRole("button", { name: "채소 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(4)
  await expect(page).toHaveURL("/places/test-rainbow-bowl")
})
test("shows a distinct no-search-result state", async ({ page }) => {
  // Given
  await page.goto("/")

  // When
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).fill("없는 메뉴")

  // Then
  await expect(page.getByText("검색 결과가 없습니다.")).toBeVisible()
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("0곳")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(0)
})
test("keeps results stable while the map moves and applies the pending area explicitly", async ({
  page,
}) => {
  // Given
  await page.goto("/")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  // When
  const viewportProbe = await page.evaluate(() => {
    const maps = Reflect.get(window, "__healthMapTestMaps")
    if (!Array.isArray(maps)) return "missing-map"
    const testMap = maps.find((candidate) => {
      if (typeof candidate !== "object" || candidate === null) return false
      const listeners = Reflect.get(candidate, "listeners")
      return typeof listeners === "object" && listeners !== null && "idle" in listeners
    })
    if (typeof testMap !== "object" || testMap === null) return "missing-map"
    const listeners = Reflect.get(testMap, "listeners")
    const setTestBounds = Reflect.get(testMap, "setTestBounds")
    if (typeof setTestBounds !== "function") return "missing-bounds"
    if (typeof listeners !== "object" || listeners === null || !("idle" in listeners))
      return "missing-idle"
    Reflect.apply(setTestBounds, testMap, [
      { latitude: 37.499, longitude: 127.031 },
      { latitude: 37.502, longitude: 127.034 },
    ])
    return "moved"
  })
  expect(viewportProbe).toBe("moved")

  // Then
  await expect(page.getByRole("button", { name: "이 지역 검색" })).toBeVisible()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await page.getByRole("button", { name: "이 지역 검색" }).click()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(1)
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("1곳")
})
test("keeps the NAVER SDK host sized after its mobile inline styles are applied", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
  const box = await page.getByTestId("naver-map").boundingBox()
  expect(box?.height).toBeGreaterThan(0)
  expect(box?.width).toBe(375)
})
test("filters by included tags, resets, and signals marker selection", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "단백질 필터" }).click()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(3)
  await page.getByRole("button", { name: "식물성 필터" }).click()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(2)
  await page.getByRole("button", { name: "전체 필터" }).click()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" }).click()
  await expect(page.getByText("장소를 선택했습니다.")).toBeVisible()
})
test("keeps list and marker selection synchronized and restores discovery on Back and Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const search = page.getByRole("searchbox", { name: "장소와 메뉴 검색" })
  await search.fill("새싹")
  await page.getByRole("button", { name: "채소 필터" }).click()

  const result = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  await result.click()
  await expect(page).toHaveURL(/\/places\/test-sprout-square$/)
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(result).toBeFocused()
  await expect(search).toHaveValue("새싹")
  await expect(page.getByRole("button", { name: "채소 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })
  await marker.focus()
  await marker.press("Enter")
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()
  await page.goBack()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(marker).toBeFocused()
  await expect(search).toHaveValue("새싹")
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("1곳")
})
test("Given a canonical discovery URL, when list and marker detail entries close, then its exact state and focus are restored", async ({
  page,
}) => {
  // Given
  const canonicalPath = "/?q=%EC%83%88%EC%8B%B9&tag=vegetables&lat=37.501&lng=127.033&z=15"
  await page.goto(canonicalPath)
  const search = page.getByRole("searchbox", { name: "장소와 메뉴 검색" })
  const filter = page.getByRole("button", { name: "채소 필터" })
  const result = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })

  // Then
  await expect(page).toHaveURL(canonicalPath)
  await expect(search).toHaveValue("새싹")
  await expect(filter).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
  await expect
    .poll(() => readNativeTestMapView(page))
    .toEqual({ latitude: 37.501, longitude: 127.033, zoom: 15 })
  await expect(page.getByTestId("map-view")).toContainText("37.5010, 127.0330 · 확대 15")

  // When
  await result.click()
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()
  await page.keyboard.press("Escape")

  // Then
  await expect(page).toHaveURL(canonicalPath)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(result).toBeFocused()
  await expect(search).toHaveValue("새싹")
  await expect(filter).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(() => readNativeTestMapView(page))
    .toEqual({ latitude: 37.501, longitude: 127.033, zoom: 15 })
  await expect(page.getByTestId("map-view")).toContainText("37.5010, 127.0330 · 확대 15")

  // When
  await marker.focus()
  await marker.press("Enter")
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()
  await page.goBack()

  // Then
  await expect(page).toHaveURL(canonicalPath)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(marker).toBeFocused()
  await expect(search).toHaveValue("새싹")
  await expect(filter).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(() => readNativeTestMapView(page))
    .toEqual({ latitude: 37.501, longitude: 127.033, zoom: 15 })
  await expect(page.getByTestId("map-view")).toContainText("37.5010, 127.0330 · 확대 15")

  // When
  await page.getByRole("button", { name: "현재 위치 다시 찾기" }).click()

  // Then
  await expect
    .poll(() => readNativeTestMapView(page))
    .toEqual({ latitude: 37.5007, longitude: 127.0328, zoom: 15 })
})
