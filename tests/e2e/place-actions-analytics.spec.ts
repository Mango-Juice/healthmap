import {
  assertPrivateTransport,
  disableGeolocation,
  installAnalyticsInterceptor,
  recordAnalyticsTransport,
  waitForEvent,
} from "./analytics-transport"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await disableGeolocation(context)
})

test("Given no analytics preference, when discovery actions run, then no analytics request is transported", async ({
  page,
}) => {
  // Given
  const transport = await recordAnalyticsTransport(page)
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  // When
  await page.getByRole("combobox", { name: "식사 형태·선택" }).selectOption("protein")
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).fill("새싹")
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).press("Enter")

  // Then
  await expect(page.getByRole("searchbox", { name: "장소와 메뉴 검색" })).toHaveValue("새싹")
  expect(
    await page.evaluate(() => localStorage.getItem("healthmap.analytics.opt-out.v1")),
  ).toBeNull()
  expect(transport.events).toEqual([])
  expect(transport.rawRequests).toEqual([])
})

test("Given a private search, when committed and the result list is reopened, then only buckets and empty properties are transported", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ width: 390, height: 844 })
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  // When
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).fill("새싹 네모식당")
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).press("Enter")
  await page.getByRole("button", { name: /검색 결과 1곳 접기/ }).click()
  await page.getByRole("button", { name: /검색 결과 1곳 보기/ }).click()

  // Then
  await waitForEvent(transport.events, "search_used", { result_count_bucket: "1_5" })
  await waitForEvent(transport.events, "result_list_opened", {})
  assertPrivateTransport(transport.events, transport.rawRequests)
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
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  // When
  await page.getByRole("combobox", { name: "식사 형태·선택" }).selectOption("protein")
  await page.getByTestId("naver-map").getByRole("button", { name: "무지개 한그릇 연구소" }).click()

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
