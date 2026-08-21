import { expect, test } from "@playwright/test"

for (const viewport of [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const) {
  test(`shows only reusable controls and feedback at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto("/showcase")

    await expect(page.getByRole("heading", { level: 1, name: "프리미티브 쇼케이스" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "필터와 버튼" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "알림, 로딩, 오류, 빈 상태" })).toBeVisible()
    await expect(page.getByTestId("map-shell")).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "대표 태그 마커" })).toHaveCount(0)

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(geometry.scrollWidth).toBe(geometry.clientWidth)
  })
}

test("keeps filter and action controls keyboard operable", async ({ page }) => {
  await page.goto("/showcase")
  const filter = page.getByRole("button", { name: "채소 필터" }).first()
  await filter.focus()
  await expect(filter).toBeFocused()
  await filter.press("Enter")
  await expect(filter).toHaveAttribute("aria-pressed", "true")

  const action = page.getByRole("button", { name: "길찾기" }).first()
  await action.focus()
  await expect(action).toBeFocused()
})
