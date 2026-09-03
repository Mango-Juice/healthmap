import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("Given populated results, When the desktop list opens, Then each place exposes menu and evidence hierarchy", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ height: 800, width: 1280 })

  // When
  await page.goto("/")

  // Then
  const result = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  await expect(result.getByText("대표 메뉴", { exact: true })).toBeVisible()
  await expect(result.getByText("초록 그릇 외 1개", { exact: true })).toBeVisible()
  await expect(result.getByText("공식 메뉴 · 2026-08-14 확인", { exact: true })).toBeVisible()
})

test("Given a populated place, When its mobile detail opens, Then the first verified menu appears before scrolling", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto("/")

  // When
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()

  // Then
  await expect(page.getByRole("heading", { name: "확인한 메뉴" })).toBeVisible()
  const menuList = page.getByRole("list", { name: "확인한 메뉴" })
  const firstMenu = menuList.getByRole("listitem").first()
  await expect(firstMenu.getByText("공식 메뉴 · 2026-08-14 확인", { exact: true })).toBeVisible()
  await expect(firstMenu.getByText("2026-11-12까지 유효", { exact: true })).toBeVisible()
  await expect(firstMenu).toBeInViewport({ ratio: 0.75 })
  await expect(page.getByRole("button", { name: "길찾기" })).toBeVisible()
})

test("Given forced colors, When discovery receives keyboard focus, Then selection and focus remain explicit", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ forcedColors: "active" })
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto("/")

  const selected = page.getByRole("button", { name: "전체 필터" })
  await expect(selected).toHaveAttribute("aria-pressed", "true")
  expect(await selected.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid")

  const vegetables = page.getByRole("button", { name: "채소 필터" })
  await vegetables.focus()
  await expect(vegetables).toBeFocused()
  expect(await vegetables.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
    "solid",
  )
  await page.screenshot({ path: testInfo.outputPath("forced-colors-discovery-375x812.png") })
})
