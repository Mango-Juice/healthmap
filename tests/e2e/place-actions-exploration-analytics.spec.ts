import {
  analyticsHosts,
  assertPrivateTransport,
  disableGeolocation,
  installAnalyticsInterceptor,
  waitForEvent,
} from "./analytics-transport"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await disableGeolocation(context)
})

test("Given a canonical shared place entry, when it loads, then shared-link opening is exact without legacy exploration", async ({
  page,
}) => {
  // Given
  const transport = await installAnalyticsInterceptor(page)

  // When
  await page.goto("/places/test-sprout-square")

  // Then
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeVisible()
  await expect
    .poll(() => transport.events.some(({ event }) => event === "shared_visit_explored"))
    .toBe(false)
  await waitForEvent(transport.events, "place_opened", {
    place_id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0",
    source: "shared_link",
  })
})

test("Given canonical map state, when a filter is selected, then one redacted shared exploration is transported", async ({
  page,
}) => {
  // Given
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/?q=&tag=balanced&lat=37.501&lng=127.033&z=15")
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await expect
    .poll(() => transport.events.some(({ event }) => event === "shared_visit_explored"))
    .toBe(false)

  // When
  await page.getByRole("combobox", { name: "식사 형태·선택" }).selectOption("protein")

  // Then
  await waitForEvent(transport.events, "filter_selected", { tag: "protein" })
  await waitForEvent(transport.events, "shared_visit_explored", {
    source: "map_share",
    action: "filter",
  })
  expect(transport.events.filter(({ event }) => event === "shared_visit_explored")).toHaveLength(1)
  assertPrivateTransport(transport.events, transport.rawRequests)
})

test("Given a removed legacy source parameter, when it is opened, then it redirects to safe root without exploration", async ({
  page,
}) => {
  // Given
  const transport = await installAnalyticsInterceptor(page)
  await page.goto("/?lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share")

  // Then
  await expect(page).toHaveURL("/")
  expect(transport.events.filter(({ event }) => event === "shared_visit_explored")).toEqual([])
})

test("Given every production place, when directions is requested, then each redacted directions event is produced", async ({
  page,
}) => {
  // Given
  const transport = await installAnalyticsInterceptor(page)
  await page.addInitScript(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: () => null,
    })
  })
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  // When
  for (const name of [
    "새싹 네모식당",
    "무지개 한그릇 연구소",
    "균형 실험실 식탁",
    "잎사귀 가상 테이블",
    "구름 도시락 공방",
  ]) {
    await page.getByRole("button", { name: `${name} 상세 보기` }).click()
    await page.getByRole("button", { name: "길찾기" }).click()
    await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  }

  // Then
  await expect
    .poll(() => transport.events.filter(({ event }) => event === "directions_opened").length)
    .toBe(5)
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
  for (const analyticsHost of analyticsHosts)
    await page.route(`${analyticsHost}/**`, (route) => route.fulfill({ status: 503 }))
  await page.goto("/places/test-sprout-square")

  // When
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await page.getByRole("combobox", { name: "식사 형태·선택" }).selectOption("protein")

  // Then
  await expect(page.getByText("공유 창을 열었습니다.")).toHaveCount(0)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(3)
})
