import { expect, test } from "./map-test"

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
  await expect(page).toHaveURL(/place=test-rainbow-bowl&src=place_share/)
  await expect(page.getByRole("heading", { name: /무지개 한그릇 연구소/ })).toBeFocused()
  await page.goBack()
  await page.waitForURL(/lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share/)
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await expect(page.getByRole("heading", { name: /무지개 한그릇 연구소/ })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "단백질 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(3)
  await expect(page.getByTestId("map-view")).toHaveText(originalView ?? "")
})

test("Given valid and invalid deep links, when the map loads, then published place wins and invalid state recovers", async ({
  page,
}) => {
  await page.goto(
    "/?place=test-sprout-square&lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share",
  )

  // Then
  await expect(page.getByRole("heading", { name: /새싹 네모식당/ })).toBeVisible()
  await expect(page).toHaveURL(/\?place=test-sprout-square&src=place_share$/)

  // When
  await page.goto("/?place=not-published&src=place_share")

  // Then
  await expect(page.getByText("유효하지 않은 장소 링크를 기본 지도로 복구했습니다.")).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test("Given a production place, when directions and sharing are requested, then directions use its coordinates and sharing remains available", async ({
  page,
}) => {
  // Given
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        sessionStorage.setItem("directions-url", url.toString())
        return null
      },
    })
  })
  await page.goto("/?place=test-sprout-square&src=place_share")

  // When
  await page.getByRole("button", { name: "길찾기" }).click()

  // Then
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("directions-url")))
    .toContain("map.naver.com/p/directions/")
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await expect(page.getByLabel("공유 URL")).toBeVisible()
})

test("Given a production place detail, when it is opened, then its production copy is explicit", async ({
  page,
}) => {
  await page.goto("/?place=test-sprout-square&src=place_share")

  const detail = page.getByTestId("place-detail")
  await expect(detail.getByText("장소 정보", { exact: true })).toBeVisible()
  await expect(detail.getByRole("region", { name: "건강식 메뉴" })).toBeVisible()
})

test("Given an open place sheet, when it is closed by the button or Escape, then the map remains available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await expect(page.getByTestId("place-detail")).toBeVisible()
  await page.getByRole("button", { name: "상세 닫기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(page.getByTestId("map-stage")).toBeVisible()
})

test("Given each production place, when directions is selected, then each coordinate route is produced", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        const urls = JSON.parse(sessionStorage.getItem("directions-urls") ?? "[]") as string[]
        sessionStorage.setItem("directions-urls", JSON.stringify([...urls, url.toString()]))
        return null
      },
    })
  })
  await page.goto("/")
  for (const name of [
    "새싹 네모식당",
    "무지개 한그릇 연구소",
    "균형 실험실 식탁",
    "잎사귀 가상 테이블",
    "구름 도시락 공방",
  ]) {
    await page.getByRole("button", { name: new RegExp(name) }).click()
    await page.getByRole("button", { name: "길찾기" }).click()
    await page.getByRole("button", { name: "상세 닫기" }).click()
  }
  const urls = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("directions-urls") ?? "[]") as string[],
  )
  expect(urls).toHaveLength(5)
  expect(urls.every((url) => url.includes("map.naver.com/p/directions/"))).toBe(true)
  await expect(page).toHaveURL(/\/$/)
})

test("Given Web Share and Clipboard outcomes, when place sharing is requested, then visible completion matches the browser outcome", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.resolve(),
    })
  })
  await page.goto("/?place=test-sprout-square&src=place_share")
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await expect(page.getByText("공유 창을 열었습니다.")).toBeVisible()
})

test("Given rejected Web Share and available Clipboard, when map sharing is requested, then a canonical URL is copied", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new DOMException("cancelled")),
    })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    })
  })
  await page.goto("/?place=test-sprout-square&src=place_share")
  await page.getByRole("button", { name: "지도 공유" }).click()
  await expect(page.getByText("공유 URL을 클립보드에 복사했습니다.")).toBeVisible()
})
