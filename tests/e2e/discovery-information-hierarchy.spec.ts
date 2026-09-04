import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("Given populated results, When the desktop list opens, Then each place exposes menu and consumer category hierarchy", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ height: 800, width: 1280 })

  // When
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  // Then
  const result = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  await expect(result.getByText("대표 메뉴", { exact: true })).toBeVisible()
  await expect(result.getByText("초록 그릇 외 1개", { exact: true })).toBeVisible()
  await expect(result).toContainText("채소 · 균형")
  await expect(result).not.toContainText(/공식 메뉴|2026-08-14|검증/)
})

test("Given a populated place, When its mobile detail opens, Then the first matching menu appears before scrolling", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  // When
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()

  // Then
  await expect(page.getByRole("heading", { name: "메뉴", exact: true })).toBeVisible()
  const menuList = page.getByRole("list", { name: "확인한 메뉴" })
  const firstMenu = menuList.getByRole("listitem").first()
  await expect(firstMenu).toContainText("초록 그릇")
  await expect(firstMenu).toContainText("선택한 조건에 맞는 메뉴")
  await expect(firstMenu).not.toContainText(/공식 메뉴|2026-08-14|2026-11-12|검증/)
  await expect(page.getByRole("link", { name: "네이버에서 보기" })).toHaveAttribute(
    "href",
    "https://map.naver.com/p/entry/place/1",
  )
  await expect(firstMenu).toBeInViewport({ ratio: 0.75 })
  await expect(page.getByRole("button", { name: "길찾기" })).toBeVisible()
})

test("Given forced colors, When discovery receives keyboard focus, Then selection and focus remain explicit", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ forcedColors: "active" })
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  const selected = page.getByRole("combobox", { name: "식사 형태·선택" })
  await expect(selected).toHaveValue("all")
  await selected.focus()
  expect(await selected.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid")

  const vegetables = page.getByRole("combobox", { name: "재료" })
  await vegetables.focus()
  await expect(vegetables).toBeFocused()
  expect(await vegetables.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
    "solid",
  )
  await page.screenshot({ path: testInfo.outputPath("forced-colors-discovery-375x812.png") })
})
