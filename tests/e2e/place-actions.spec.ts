import { expect, test } from "@playwright/test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("Given a marker selection, when it is opened and closed through browser history, then only place state changes", async ({
  page,
}) => {
  // Given
  await page.goto("/?lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share")
  await expect(page.getByTestId("map-view")).toHaveText("37.5010, 127.0330 · 확대 15")
  const originalView = await page.getByTestId("map-view").textContent()
  await page.getByRole("button", { name: "단백질 필터" }).click()

  // When
  await page.getByRole("button", { name: /무지개 한그릇 연구소/ }).click()

  // Then
  await expect(page).toHaveURL(/place=mock-rainbow-bowl&src=place_share/)
  await expect(page.getByRole("heading", { name: /무지개 한그릇 연구소/ })).toBeFocused()
  await page.goBack()
  await page.waitForURL(/lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share/)
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await expect(page.getByRole("heading", { name: /무지개 한그릇 연구소/ })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "단백질 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByRole("button", { name: /샘플/ })).toHaveCount(3)
  await expect(page.getByTestId("map-view")).toHaveText(originalView ?? "")
})

test("Given valid and invalid deep links, when the map loads, then published place wins and invalid state recovers", async ({
  page,
}) => {
  await page.goto(
    "/?place=mock-sprout-square&lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share",
  )

  // Then
  await expect(page.getByRole("heading", { name: /새싹 네모식당/ })).toBeVisible()
  await expect(page).toHaveURL(/\?place=mock-sprout-square&src=place_share$/)

  // When
  await page.goto("/?place=not-published&src=place_share")

  // Then
  await expect(page.getByText("유효하지 않은 장소 링크를 기본 지도로 복구했습니다.")).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test("Given a mock place, when directions and sharing are requested, then directions stay local and sharing falls back to a selectable URL", async ({
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
  await page.goto("/?place=mock-sprout-square&src=place_share")

  // When
  await page.getByRole("button", { name: "길찾기" }).click()

  // Then
  await expect(page.getByText("샘플 데이터에서는 길찾기를 제공하지 않습니다.")).toBeVisible()
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await expect(page.getByLabel("공유 URL")).toBeVisible()
})
